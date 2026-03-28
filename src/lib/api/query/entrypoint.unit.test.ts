import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEndpoints, ApiRequestFunction } from 'ts-ag';

type TestResponse = ApiEndpoints['response'];

type UserInput = { id: number; group?: string };
type BatchedInput = { ids: number[] };

type UsersApi = {
  path: '/users';
  method: 'GET';
  requestInput: UserInput | BatchedInput;
  requestOutput: null;
  response: TestResponse;
};

type UsersRequest = ApiRequestFunction<UsersApi>;

function getUserId(input: UsersApi['requestInput']): number {
  return 'id' in input ? input.id : input.ids[0]!;
}

function jsonResponse(body: unknown, status = 200): TestResponse {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  }) as TestResponse;
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
  });

  it('returns the same query instance for the same path, method, and input', async () => {
    const { createQueryFunction } = await import('./entrypoint.svelte.js');
    const requestMock = vi.fn(async () => jsonResponse({ ok: true }));
    const request = requestMock as unknown as UsersRequest;
    const createQuery = createQueryFunction<UsersApi>(request, {});

    const query1 = createQuery('/users', 'GET', { id: 1 });
    const query2 = createQuery('/users', 'GET', { id: 1 });
    const query3 = createQuery('/users', 'GET', { id: 2 });

    expect(query1).toBe(query2);
    expect(query3).not.toBe(query1);
  });

  it('reuses requestors so separate queries can batch together', async () => {
    const { createQueryFunction } = await import('./entrypoint.svelte.js');
    const requestMock = vi.fn(async () => jsonResponse({ ok: true }));
    const request = requestMock as unknown as UsersRequest;
    const createQuery = createQueryFunction<UsersApi>(request, {
      '/users': {
        GET: {
          canBatch: () => 'users',
          batchInput: (inputs) => ({ ids: inputs.map(getUserId) }),
          unBatchOutput: (inputs) => inputs.map((input) => jsonResponse({ id: getUserId(input) }))
        }
      }
    });

    const query1 = createQuery('/users', 'GET', { id: 1 });
    const query2 = createQuery('/users', 'GET', { id: 2 });

    const p1 = query1.request();
    const p2 = query2.request();

    await vi.advanceTimersByTimeAsync(100);

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith('/users', 'GET', { ids: [1, 2] });

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ id: 1 });
    await expect(response2.json()).resolves.toEqual({ id: 2 });
  });
});
