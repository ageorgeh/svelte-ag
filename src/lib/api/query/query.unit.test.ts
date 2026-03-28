import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache } from './cache.svelte.js';
import { Query, Requestor } from './query.svelte.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('Requestor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes through non-batched requests', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }));
    const requestor = new Requestor('/users', 'GET', request, new Cache());

    const response = await requestor.request({ id: 1 });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/users', 'GET', { id: 1 });
    await expect(response.json()).resolves.toEqual({ id: 1 });
  });

  it('batches requests with the same batch id and preserves response order', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const requestor = new Requestor('/users', 'GET', request, new Cache(), {
      canBatch: (input: any) => input.group,
      batchInput: (inputs: any[]) => ({ ids: inputs.map((input) => input.id) }),
      unBatchOutput: (inputs: any[]) => inputs.map((input) => jsonResponse({ id: input.id }))
    });

    const p1 = requestor.request({ id: 1, group: 'team' });
    const p2 = requestor.request({ id: 2, group: 'team' });

    await vi.advanceTimersByTimeAsync(99);
    expect(request).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/users', 'GET', { ids: [1, 2] });

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ id: 1 });
    await expect(response2.json()).resolves.toEqual({ id: 2 });
  });

  it('rate limits separate batches by start time rather than completion time', async () => {
    const starts: number[] = [];
    const request = vi.fn().mockImplementation(async (_path, _method, input: any) => {
      starts.push(Date.now());

      if (input.ids[0] === 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      return jsonResponse({ ids: input.ids });
    });

    const requestor = new Requestor('/users', 'GET', request, new Cache(), {
      canBatch: (input: any) => input.group,
      batchInput: (inputs: any[]) => ({ ids: inputs.map((input) => input.id) }),
      unBatchOutput: (_inputs: any[], output: Response) => [output]
    });

    const p1 = requestor.request({ id: 1, group: 'a' });
    const p2 = requestor.request({ id: 2, group: 'b' });

    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([100]);

    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([100, 200]);

    await vi.runAllTimersAsync();

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ ids: [1] });
    await expect(response2.json()).resolves.toEqual({ ids: [2] });
  });

  it('returns batched error responses without rejecting them', async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ ok: false }, 207));
    const requestor = new Requestor('/users', 'GET', request, new Cache(), {
      canBatch: () => 'team',
      batchInput: (inputs: any[]) => ({ ids: inputs.map((input) => input.id) }),
      unBatchOutput: () => [jsonResponse({ message: 'bad request' }, 400)]
    });

    const responsePromise = requestor.request({ id: 1 });

    await vi.advanceTimersByTimeAsync(100);

    const response = await responsePromise;
    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: 'bad request' });
  });

  it('rejects all queued callers when a batched fetch throws', async () => {
    const request = vi.fn().mockRejectedValue(new Error('network down'));
    const requestor = new Requestor('/users', 'GET', request, new Cache(), {
      canBatch: () => 'team',
      batchInput: (inputs: any[]) => ({ ids: inputs.map((input) => input.id) }),
      unBatchOutput: (_inputs: any[], output: Response) => [output]
    });

    const p1 = requestor.request({ id: 1 });
    const p2 = requestor.request({ id: 2 });
    const p1Expectation = expect(p1).rejects.toThrow('network down');
    const p2Expectation = expect(p2).rejects.toThrow('network down');

    await vi.advanceTimersByTimeAsync(100);

    await Promise.all([p1Expectation, p2Expectation]);
  });
});

describe('Query', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('deduplicates concurrent requests and returns readable responses to each caller', async () => {
    const pending = deferred<Response>();
    const requestor = {
      request: vi.fn().mockReturnValue(pending.promise)
    } as unknown as Requestor<any, any, any>;

    const query = new Query({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const p1 = query.request();
    const p2 = query.request();

    expect((requestor as any).request).toHaveBeenCalledTimes(1);

    pending.resolve(jsonResponse({ id: 1 }));

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ id: 1 });
    await expect(response2.json()).resolves.toEqual({ id: 1 });
  });

  it('caches responses and returns a fresh readable clone on cache hits', async () => {
    const requestor = {
      request: vi.fn().mockResolvedValue(jsonResponse({ id: 1, name: 'Ada' }))
    } as unknown as Requestor<any, any, any>;

    const query = new Query({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const first = await query.request();
    const second = await query.request();

    expect((requestor as any).request).toHaveBeenCalledTimes(1);
    expect(query.isCached).toBe(true);
    await expect(first.json()).resolves.toEqual({ id: 1, name: 'Ada' });
    await expect(second.json()).resolves.toEqual({ id: 1, name: 'Ada' });
  });

  it('updates success state from successful responses', async () => {
    const requestor = {
      request: vi.fn().mockResolvedValue(jsonResponse({ id: 1, active: true }))
    } as unknown as Requestor<any, any, any>;

    const query = new Query({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const response = await query.request();

    expect(query.status).toBe('success');
    expect(query.data).toEqual({ id: 1, active: true });
    expect(query.errorData).toBeNull();
    await expect(response.json()).resolves.toEqual({ id: 1, active: true });
  });

  it('updates error state from error responses without throwing', async () => {
    const requestor = {
      request: vi.fn().mockResolvedValue(jsonResponse({ message: 'missing' }, 404))
    } as unknown as Requestor<any, any, any>;

    const query = new Query({
      path: '/users',
      method: 'GET',
      input: { id: 99 },
      requestor,
      cache: new Cache()
    });

    const response = await query.request();

    expect(query.status).toBe('error');
    expect(query.data).toBeNull();
    expect(query.errorData).toEqual({ message: 'missing' });
    expect(response.ok).toBe(false);
    await expect(response.json()).resolves.toEqual({ message: 'missing' });
  });

  it('clears the pending request when the request throws so later retries can succeed', async () => {
    const requestor = {
      request: vi
        .fn()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(jsonResponse({ id: 1, recovered: true }))
    } as unknown as Requestor<any, any, any>;

    const query = new Query({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    await expect(query.request()).rejects.toThrow('network down');
    expect(query.status).toBe('error');

    const response = await query.request();

    expect((requestor as any).request).toHaveBeenCalledTimes(2);
    expect(query.status).toBe('success');
    await expect(response.json()).resolves.toEqual({ id: 1, recovered: true });
  });

  it('resetCache forces the next request to fetch again', async () => {
    const requestor = {
      request: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ call: 1 }))
        .mockResolvedValueOnce(jsonResponse({ call: 2 }))
    } as unknown as Requestor<any, any, any>;

    const query = new Query({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const first = await query.request();
    query.resetCache();
    const second = await query.request();

    expect((requestor as any).request).toHaveBeenCalledTimes(2);
    await expect(first.json()).resolves.toEqual({ call: 1 });
    await expect(second.json()).resolves.toEqual({ call: 2 });
  });

  it('honors custom cache timeout options', async () => {
    const requestor = {
      request: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ call: 1 }))
        .mockResolvedValueOnce(jsonResponse({ call: 2 }))
    } as unknown as Requestor<any, any, any>;

    const query = new Query({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache(),
      opts: {
        cache: { timeout: 50 }
      }
    });

    const first = await query.request();
    vi.advanceTimersByTime(49);
    const cached = await query.request();
    vi.advanceTimersByTime(1);
    const refreshed = await query.request();

    expect((requestor as any).request).toHaveBeenCalledTimes(2);
    await expect(first.json()).resolves.toEqual({ call: 1 });
    await expect(cached.json()).resolves.toEqual({ call: 1 });
    await expect(refreshed.json()).resolves.toEqual({ call: 2 });
  });
});
