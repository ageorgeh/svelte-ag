import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiRequest, type ApiEndpoints } from 'ts-ag';
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
  method: 'POST';
  requestInput: BatchedUserInput | BatchedRequestInput;
  requestOutput: null;
  response: TestResponse;
};

const API_URL = 'https://api.example.test';

const plainSchemas = {
  '/users': {
    GET: v.object({ id: v.number() })
  }
};

const batchedSchemas = {
  '/users': {
    POST: v.union([v.object({ id: v.number(), group: v.optional(v.string()) }), v.object({ ids: v.array(v.number()) })])
  }
};

function getSingleId(input: BatchedUsersApi['requestInput']): number {
  return 'id' in input ? input.id : input.ids[0]!;
}

function jsonFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function jsonResponse(body: unknown, status = 200): TestResponse {
  return jsonFetchResponse(body, status) as TestResponse;
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

function createPlainRequest() {
  return createApiRequest<PlainUsersApi>(plainSchemas, API_URL, 'test');
}

function createBatchedRequest() {
  return createApiRequest<BatchedUsersApi>(batchedSchemas, API_URL, 'test');
}

function createPlainRequestor() {
  return new Requestor<PlainUsersApi, '/users', 'GET'>('/users', 'GET', createPlainRequest(), new Cache());
}

function createBatchedRequestor(
  batchDetails?: ConstructorParameters<typeof Requestor<BatchedUsersApi, '/users', 'POST'>>[4]
) {
  return new Requestor<BatchedUsersApi, '/users', 'POST'>(
    '/users',
    'POST',
    createBatchedRequest(),
    new Cache(),
    batchDetails
  );
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
    const fetchMock = vi.fn(async () => jsonFetchResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const requestor = createPlainRequestor();

    const response = await requestor.request({ id: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}//users?id=1`,
      expect.objectContaining({
        method: 'GET',
        credentials: 'include'
      })
    );
    await expect(response.json()).resolves.toEqual({ id: 1 });
  });

  it('devalue response', async () => {
    const fetchMock = vi.fn(async () => devalueFetchResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const requestor = createPlainRequestor();

    const response = await requestor.request({ id: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}//users?id=1`,
      expect.objectContaining({
        method: 'GET',
        credentials: 'include'
      })
    );
    await expect(response.json()).resolves.toEqual({ id: 1 });
  });

  it('batches requests with the same batch id and preserves response order', async () => {
    const fetchMock = vi.fn(async () => jsonFetchResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const requestor = createBatchedRequestor({
      canBatch: (input) => ('group' in input && input.group) || false,
      batchInput: (inputs) => ({ ids: inputs.map(getSingleId) }),
      unBatchOutput: (inputs) => inputs.map((input) => jsonResponse({ id: getSingleId(input) }))
    });

    const p1 = requestor.request({ id: 1, group: 'team' });
    const p2 = requestor.request({ id: 2, group: 'team' });

    await vi.advanceTimersByTimeAsync(99);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}//users`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ids: [1, 2] }),
        credentials: 'include'
      })
    );

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ id: 1 });
    await expect(response2.json()).resolves.toEqual({ id: 2 });
  });

  it('rate limits separate batches by start time rather than completion time', async () => {
    const starts: number[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      starts.push(Date.now());

      if (init?.body === JSON.stringify({ ids: [1] })) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      return jsonFetchResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    const requestor = createBatchedRequestor({
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
    await expect(response1.json()).resolves.toEqual({ ok: true });
    await expect(response2.json()).resolves.toEqual({ ok: true });
  });

  it('returns batched error responses without rejecting them', async () => {
    const fetchMock = vi.fn(async () => jsonFetchResponse({ ok: false }, 207));
    vi.stubGlobal('fetch', fetchMock);
    const requestor = createBatchedRequestor({
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
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const requestor = createBatchedRequestor({
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
    vi.unstubAllGlobals();
  });

  it('deduplicates concurrent requests and returns readable responses to each caller', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor: createPlainRequestor(),
      cache: new Cache()
    });

    const p1 = query.request();
    const p2 = query.request();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending.resolve(jsonFetchResponse({ id: 1 }));

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ id: 1 });
    await expect(response2.json()).resolves.toEqual({ id: 1 });
  });

  it('caches responses and returns readable responses on cache hits', async () => {
    const fetchMock = vi.fn(async () => jsonFetchResponse({ id: 1, name: 'Ada' }));
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor: createPlainRequestor(),
      cache: new Cache()
    });

    const first = await query.request();
    const second = await query.request();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(query.isCached).toBe(true);
    await expect(first.json()).resolves.toEqual({ id: 1, name: 'Ada' });
    await expect(second.json()).resolves.toEqual({ id: 1, name: 'Ada' });
  });

  it('preserves devalue parsing for query state, returned responses, and cache hits', async () => {
    const fetchMock = vi.fn(async () =>
      devalueFetchResponse({ id: 1, createdAt: new Date('2024-01-01T00:00:00.000Z') })
    );
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor: createPlainRequestor(),
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

  it('preserves arbitrary response overrides across query responses and cache hits', async () => {
    const fetchMock = vi.fn(async () => withResponseOverrides(jsonFetchResponse({ id: 1 })));
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor: createPlainRequestor(),
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.extra()).toBe('copied');
    expect(first.meta).toEqual({ source: 'custom' });
    expect(second.extra()).toBe('copied');
    expect(second.meta).toEqual({ source: 'custom' });
  });

  it('updates success state from successful responses', async () => {
    const fetchMock = vi.fn(async () => jsonFetchResponse({ id: 1, active: true }));
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor: createPlainRequestor(),
      cache: new Cache()
    });

    const response = await query.request();

    expect(query.status).toBe('success');
    expect(query.data).toEqual({ id: 1, active: true });
    expect(query.errorData).toBeNull();
    await expect(response.json()).resolves.toEqual({ id: 1, active: true });
  });

  it('updates error state from error responses without throwing', async () => {
    const fetchMock = vi.fn(async () => jsonFetchResponse({ message: 'missing' }, 404));
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 99 },
      requestor: createPlainRequestor(),
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
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;

      if (callCount === 1) {
        throw new Error('network down');
      }

      return jsonFetchResponse({ id: 1, recovered: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor: createPlainRequestor(),
      cache: new Cache()
    });

    await expect(query.request()).rejects.toThrow('network down');
    expect(query.status).toBe('error');

    const responsePromise = query.request();
    await vi.advanceTimersByTimeAsync(100);
    const response = await responsePromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(query.status).toBe('success');
    await expect(response.json()).resolves.toEqual({ id: 1, recovered: true });
  });

  it('resetCache forces the next request to fetch again', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      return jsonFetchResponse({ call: callCount });
    });
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor: createPlainRequestor(),
      cache: new Cache()
    });

    const first = await query.request();
    query.resetCache();
    const secondPromise = query.request();
    await vi.advanceTimersByTimeAsync(100);
    const second = await secondPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(first.json()).resolves.toEqual({ call: 1 });
    await expect(second.json()).resolves.toEqual({ call: 2 });
  });

  it('honors custom cache timeout options', async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      return jsonFetchResponse({ call: callCount });
    });
    vi.stubGlobal('fetch', fetchMock);
    const query = new Query<PlainUsersApi, '/users', 'GET'>({
      path: '/users',
      method: 'GET',
      input: { id: 1 },
      requestor: createPlainRequestor(),
      cache: new Cache(),
      opts: {
        cache: { timeout: 50 }
      }
    });

    const first = await query.request();
    vi.advanceTimersByTime(49);
    const cached = await query.request();
    vi.advanceTimersByTime(1);
    const refreshedPromise = query.request();
    await vi.advanceTimersByTimeAsync(50);
    const refreshed = await refreshedPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(first.json()).resolves.toEqual({ call: 1 });
    await expect(cached.json()).resolves.toEqual({ call: 1 });
    await expect(refreshed.json()).resolves.toEqual({ call: 2 });
  });
});
