import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown, status = 200): Response {
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
  });

  it('returns the same query instance for the same path, method, and input', async () => {
    const { createQueryFunction } = await import('./entrypoint.svelte.js');
    const request = vi.fn();
    const createQuery = createQueryFunction<any>(request, {});

    const query1 = createQuery('/users', 'GET', { id: 1 });
    const query2 = createQuery('/users', 'GET', { id: 1 });
    const query3 = createQuery('/users', 'GET', { id: 2 });

    expect(query1).toBe(query2);
    expect(query3).not.toBe(query1);
  });

  it('reuses requestors so separate queries can batch together', async () => {
    const { createQueryFunction } = await import('./entrypoint.svelte.js');
    const request = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const createQuery = createQueryFunction<any>(request, {
      '/users': {
        GET: {
          canBatch: () => 'users',
          batchInput: (inputs: any[]) => ({ ids: inputs.map((input) => input.id) }),
          unBatchOutput: (inputs: any[]) => inputs.map((input) => jsonResponse({ id: input.id }))
        }
      }
    });

    const query1 = createQuery('/users', 'GET', { id: 1 });
    const query2 = createQuery('/users', 'GET', { id: 2 });

    const p1 = query1.request();
    const p2 = query2.request();

    await vi.advanceTimersByTimeAsync(100);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/users', 'GET', { ids: [1, 2] });

    const [response1, response2] = await Promise.all([p1, p2]);
    await expect(response1.json()).resolves.toEqual({ id: 1 });
    await expect(response2.json()).resolves.toEqual({ id: 2 });
  });
});
