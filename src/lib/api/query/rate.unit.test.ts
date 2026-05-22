import { sleep } from 'radash';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { RateLimiter } from './rate.svelte.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts the first request immediately', async () => {
    const limiter = new RateLimiter();
    const fn = vi.fn().mockResolvedValue('ok');

    const promise = limiter.add(fn);

    await Promise.resolve();

    expect(fn).toHaveBeenCalledTimes(1);

    await expect(promise).resolves.toBe('ok');
  });

  it('spaces simultaneous requests by at least 100ms', async () => {
    const limiter = new RateLimiter();
    const starts: number[] = [];

    const makeTask = (label: string) =>
      vi.fn().mockImplementation(async () => {
        starts.push(Date.now());
        await sleep(105);
        return label;
      });

    const p1 = limiter.add(makeTask('a'));
    const p2 = limiter.add(makeTask('b'));
    const p3 = limiter.add(makeTask('c'));
    const p4 = limiter.add(makeTask('d'));
    const p5 = limiter.add(makeTask('e'));

    await Promise.resolve();
    expect(starts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(99);
    expect(starts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([0, 100]);

    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([0, 100, 200]);

    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([0, 100, 200, 300]);

    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([0, 100, 200, 300, 400]);

    await vi.runAllTimersAsync();
    await expect(Promise.all([p1, p2, p3, p4, p5])).resolves.toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('does not bunch requests together after waiting', async () => {
    const limiter = new RateLimiter();
    const starts: number[] = [];

    const task = () =>
      limiter.add(async () => {
        starts.push(Date.now());
        await sleep(105);
      });

    const p1 = task();
    const p2 = task();
    const p3 = task();

    await Promise.resolve();
    expect(starts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([0, 100]);

    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([0, 100, 200]);

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2, p3]);
  });

  it('keeps working after a request fails', async () => {
    const limiter = new RateLimiter();
    const starts: number[] = [];

    const p1 = limiter.add(async () => {
      starts.push(Date.now());
      await sleep(200);
      throw new Error('boom');
    });
    const p1Expectation = expect(p1).rejects.toThrow('boom');

    const p2 = limiter.add(async () => {
      starts.push(Date.now());
      return 'ok';
    });

    await Promise.resolve();
    expect(starts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(100);
    expect(starts).toEqual([0, 100]);

    await vi.advanceTimersByTimeAsync(100);

    await p1Expectation;
    await expect(p2).resolves.toBe('ok');
  });

  it('only limits start time, not completion time', async () => {
    const limiter = new RateLimiter();
    const starts: number[] = [];

    const p1 = limiter.add(async () => {
      starts.push(Date.now());
      await new Promise((r) => setTimeout(r, 1000));
      return 'slow';
    });

    const p2 = limiter.add(async () => {
      starts.push(Date.now());
      return 'fast';
    });

    await Promise.resolve();
    expect(starts).toEqual([0]);

    await vi.advanceTimersByTimeAsync(200);
    expect(starts).toEqual([0, 100]);

    await vi.advanceTimersByTimeAsync(900);

    await expect(p2).resolves.toBe('fast');
    await expect(p1).resolves.toBe('slow');
  });
});
