import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiRequest, type ApiEndpoints, type ApiRequestFunction } from 'ts-ag';
import { Cache } from './cache.svelte.js';
import { Query, Requestor } from './query.svelte.js';
import { stringify } from 'devalue';
import * as v from 'valibot';

type PlainUserInput = { id: number };
type BatchedUserInput = { id: number; group?: string };
type BatchedRequestInput = { ids: number[] };

type TestResponse = ApiEndpoints['response'];

type PlainUsersApi = {
  path: '/users';
  method: 'GET';
  requestInput: PlainUserInput;
  requestOutput: null;
  response: TestResponse;
};

type BatchedUsersApi = {
  path: '/users';
  method: 'GET';
  requestInput: BatchedUserInput | BatchedRequestInput;
  requestOutput: null;
  response: TestResponse;
};

type PlainUsersRequestor = Requestor<PlainUsersApi, '/users', 'GET'>;
type PlainUsersRequest = ApiRequestFunction<PlainUsersApi>;
type BatchedUsersRequest = ApiRequestFunction<BatchedUsersApi>;

function getSingleId(input: BatchedUsersApi['requestInput']): number {
  return 'id' in input ? input.id : input.ids[0]!;
}

function jsonResponse(body: unknown, status = 200): TestResponse {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  }) as TestResponse;
}

function devalueFetchResponse(body: unknown, status = 200): Response {
  return new Response(stringify(body), {
    status,
    headers: { 'content-type': 'application/devalue' }
  });
}

function withResponseOverrides<T extends Response>(
  response: T
): T & {
  extra: () => string;
  meta: { source: string };
} {
  Object.defineProperty(response, 'extra', {
    configurable: true,
    value: () => 'copied'
  });
  Object.defineProperty(response, 'meta', {
    configurable: true,
    value: { source: 'custom' }
  });

  return response as T & {
    extra: () => string;
    meta: { source: string };
  };
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
    vi.unstubAllGlobals();
  });

  it('passes through non-batched requests', async () => {
    const requestMock = vi.fn(async () => jsonResponse({ id: 1 }));
    const request = requestMock as unknown as PlainUsersRequest;
    const requestor = new Requestor<PlainUsersApi, '/users', 'GET'>('/users', 'GET', request, new Cache());

    const response = await requestor.request({ id: 1 });

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith('/users', 'GET', { id: 1 });
    await expect(response.json()).resolves.toEqual({ id: 1 });
  });

  it('devalue response', async () => {
    const fetchMock = vi.fn(async () => devalueFetchResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = createApiRequest<PlainUsersApi>(
      {
        '/users': {
          GET: v.object({ id: v.number() })
        }
      },
      'https://api.example.test',
      'test'
    );
    const requestor = new Requestor<PlainUsersApi, '/users', 'GET'>('/users', 'GET', request, new Cache());

    const response = await requestor.request({ id: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test//users?id=1',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include'
      })
    );
    await expect(response.json()).resolves.toEqual({ id: 1 });
  });

  it('batches requests with the same batch id and preserves response order', async () => {
    const requestMock = vi.fn(async () => jsonResponse({ ok: true }));
    const request = requestMock as unknown as BatchedUsersRequest;
    const requestor = new Requestor<BatchedUsersApi, '/users', 'GET'>('/users', 'GET', request, new Cache(), {
      canBatch: (input) => ('group' in input && input.group) || false,
      batchInput: (inputs) => ({ ids: inputs.map(getSingleId) }),
      unBatchOutput: (inputs) => inputs.map((input) => jsonResponse({ id: getSingleId(input) }))
    });

    const p1 = requestor.request({ id: 1, group: 'team' });
    const p2 = requestor.request({ id: 2, group: 'team' });

    await vi.advanceTimersByTimeAsync(99);
    expect(requestMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith('/users', 'GET', { ids: [1, 2] });

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ id: 1 });
    await expect(response2.json()).resolves.toEqual({ id: 2 });
  });

  it('rate limits separate batches by start time rather than completion time', async () => {
    const starts: number[] = [];
    const requestMock = vi.fn(async (_path: '/users', _method: 'GET', input: BatchedUsersApi['requestInput']) => {
      starts.push(Date.now());

      if ('ids' in input && input.ids[0] === 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      return jsonResponse({ ids: 'ids' in input ? input.ids : [input.id] });
    });
    const request = requestMock as unknown as BatchedUsersRequest;

    const requestor = new Requestor<BatchedUsersApi, '/users', 'GET'>('/users', 'GET', request, new Cache(), {
      canBatch: (input) => ('group' in input && input.group) || false,
      batchInput: (inputs) => ({ ids: inputs.map(getSingleId) }),
      unBatchOutput: (_inputs, output) => [output]
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
    const requestMock = vi.fn(async () => jsonResponse({ ok: false }, 207));
    const request = requestMock as unknown as BatchedUsersRequest;
    const requestor = new Requestor<BatchedUsersApi, '/users', 'GET'>('/users', 'GET', request, new Cache(), {
      canBatch: () => 'team',
      batchInput: (inputs) => ({ ids: inputs.map(getSingleId) }),
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
    const requestMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const request = requestMock as unknown as BatchedUsersRequest;
    const requestor = new Requestor<BatchedUsersApi, '/users', 'GET'>('/users', 'GET', request, new Cache(), {
      canBatch: () => 'team',
      batchInput: (inputs) => ({ ids: inputs.map(getSingleId) }),
      unBatchOutput: (_inputs, output) => [output]
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
    const requestMock = vi.fn().mockReturnValue(pending.promise);
    const requestor = {
      request: requestMock as PlainUsersRequest
    } as unknown as PlainUsersRequestor;

    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const p1 = query.request();
    const p2 = query.request();

    expect(requestMock).toHaveBeenCalledTimes(1);

    pending.resolve(jsonResponse({ id: 1 }));

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ id: 1 });
    await expect(response2.json()).resolves.toEqual({ id: 1 });
  });

  it('caches responses and returns a fresh readable clone on cache hits', async () => {
    const requestMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, name: 'Ada' }));
    const requestor = {
      request: requestMock as PlainUsersRequest
    } as unknown as PlainUsersRequestor;

    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const first = await query.request();
    const second = await query.request();

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(query.isCached).toBe(true);
    await expect(first.json()).resolves.toEqual({ id: 1, name: 'Ada' });
    await expect(second.json()).resolves.toEqual({ id: 1, name: 'Ada' });
  });

  it('preserves devalue parsing for query state, returned responses, and cache hits', async () => {
    const fetchMock = vi.fn(async () =>
      devalueFetchResponse({ id: 1, createdAt: new Date('2024-01-01T00:00:00.000Z') })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = createApiRequest<PlainUsersApi>(
      {
        '/users': {
          GET: v.object({ id: v.number() })
        }
      },
      'https://api.example.test',
      'test'
    );
    const requestor = new Requestor<PlainUsersApi, '/users', 'GET'>('/users', 'GET', request, new Cache());
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const firstResponse = await query.request();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(query.status).toBe('success');
    expect(query.data).toEqual({ id: 1, createdAt: new Date('2024-01-01T00:00:00.000Z') });
    await expect(firstResponse.json()).resolves.toEqual({
      id: 1,
      createdAt: new Date('2024-01-01T00:00:00.000Z')
    });

    const cachedResponse = await query.request();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(cachedResponse.json()).resolves.toEqual({
      id: 1,
      createdAt: new Date('2024-01-01T00:00:00.000Z')
    });
  });

  it('preserves arbitrary response overrides across query clones and cache hits', async () => {
    const customResponse = withResponseOverrides(jsonResponse({ id: 1 }) as Response);
    const requestMock = vi.fn().mockResolvedValue(customResponse);
    const requestor = {
      request: requestMock as PlainUsersRequest
    } as unknown as PlainUsersRequestor;

    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const first = (await query.request()) as Response & {
      extra: () => string;
      meta: { source: string };
    };
    const second = (await query.request()) as Response & {
      extra: () => string;
      meta: { source: string };
    };

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(first.extra()).toBe('copied');
    expect(first.meta).toEqual({ source: 'custom' });
    expect(second.extra()).toBe('copied');
    expect(second.meta).toEqual({ source: 'custom' });
  });

  it('updates success state from successful responses', async () => {
    const requestMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, active: true }));
    const requestor = {
      request: requestMock as PlainUsersRequest
    } as unknown as PlainUsersRequestor;

    const query = new Query<PlainUsersApi, '/users', 'GET'>({
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
    const requestMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'missing' }, 404));
    const requestor = {
      request: requestMock as PlainUsersRequest
    } as unknown as PlainUsersRequestor;

    const query = new Query<PlainUsersApi, '/users', 'GET'>({
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
    const requestMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ id: 1, recovered: true }));
    const requestor = {
      request: requestMock as PlainUsersRequest
    } as unknown as PlainUsersRequestor;

    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    await expect(query.request()).rejects.toThrow('network down');
    expect(query.status).toBe('error');

    const response = await query.request();

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(query.status).toBe('success');
    await expect(response.json()).resolves.toEqual({ id: 1, recovered: true });
  });

  it('resetCache forces the next request to fetch again', async () => {
    const requestMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ call: 1 }))
      .mockResolvedValueOnce(jsonResponse({ call: 2 }));
    const requestor = {
      request: requestMock as PlainUsersRequest
    } as unknown as PlainUsersRequestor;

    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor,
      cache: new Cache()
    });

    const first = await query.request();
    query.resetCache();
    const second = await query.request();

    expect(requestMock).toHaveBeenCalledTimes(2);
    await expect(first.json()).resolves.toEqual({ call: 1 });
    await expect(second.json()).resolves.toEqual({ call: 2 });
  });

  it('honors custom cache timeout options', async () => {
    const requestMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ call: 1 }))
      .mockResolvedValueOnce(jsonResponse({ call: 2 }));
    const requestor = {
      request: requestMock as PlainUsersRequest
    } as unknown as PlainUsersRequestor;

    const query = new Query<PlainUsersApi, '/users', 'GET'>({
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

    expect(requestMock).toHaveBeenCalledTimes(2);
    await expect(first.json()).resolves.toEqual({ call: 1 });
    await expect(cached.json()).resolves.toEqual({ call: 1 });
    await expect(refreshed.json()).resolves.toEqual({ call: 2 });
  });
});
