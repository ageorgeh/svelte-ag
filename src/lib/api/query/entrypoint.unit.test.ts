import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiRequest, type ApiEndpoints } from 'ts-ag';
import * as v from 'valibot';

type TestResponse = ApiEndpoints['response'];

type UserInput = { id: number; group?: string };
type BatchedInput = { ids: number[] };

type UsersApi = {
  path: '/users';
  method: 'POST';
  requestInput: UserInput | BatchedInput;
  requestOutput: null;
  response: TestResponse;
};

const API_URL = 'https://api.example.test';

const schemas = {
  '/users': {
    POST: v.union([v.object({ id: v.number(), group: v.optional(v.string()) }), v.object({ ids: v.array(v.number()) })])
  }
};

function getUserId(input: UsersApi['requestInput']): number {
  return 'id' in input ? input.id : input.ids[0]!;
}

function jsonFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('createQueryFunction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the same query instance for the same path, method, and input', async () => {
    const { createQueryFunction } = await import('./entrypoint.svelte.js');
    const request = createApiRequest<UsersApi>(schemas, API_URL, 'test');
    const createQuery = createQueryFunction<UsersApi>(request, {});

    const query1 = createQuery('/users', 'POST', { id: 1 });
    const query2 = createQuery('/users', 'POST', { id: 1 });
    const query3 = createQuery('/users', 'POST', { id: 2 });

    expect(query1).toBe(query2);
    expect(query3).not.toBe(query1);
  });

  it('reuses requestors so separate queries can batch together', async () => {
    const { createQueryFunction } = await import('./entrypoint.svelte.js');
    const fetchMock = vi.fn(async () => jsonFetchResponse({ 1: 'one', 2: 'two' }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    const request = createApiRequest<UsersApi>(schemas, API_URL, 'test');
    const createQuery = createQueryFunction<UsersApi>(request, {
      '/users': {
        POST: {
          canBatch: () => 'users',
          batchInput: (inputs) => ({ ids: inputs.map(getUserId) }),
          unBatchOutput: async (inputs, outputs) => {
            return inputs.map(() => {
              return outputs;
            });
          }
        }
      }
    });

    const query1 = createQuery('/users', 'POST', { id: 1 });
    const query2 = createQuery('/users', 'POST', { id: 2 });

    const p1 = query1.request();
    const p2 = query2.request();

    await vi.advanceTimersByTimeAsync(100);

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
    await expect(response1.json()).resolves.toEqual({ 1: 'one', 2: 'two' });
    await expect(response2.json()).resolves.toEqual({ 1: 'one', 2: 'two' });
  });
});
