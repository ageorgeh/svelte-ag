import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Cache } from './cache.svelte.js';

describe('Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stores and expires values based on timeout', () => {
    const cache = new Cache();

    cache.register('user', { timeout: 100 });
    cache.set('user', { id: 1 });

    expect(cache.has('user')).toBe(true);
    expect(cache.get('user')).toEqual({ id: 1 });

    vi.advanceTimersByTime(99);
    expect(cache.has('user')).toBe(true);
    expect(cache.get('user')).toEqual({ id: 1 });

    vi.advanceTimersByTime(1);
    expect(cache.has('user')).toBe(false);
    expect(cache.get('user')).toBeNull();
  });

  it('supports infinite timeout and reset', () => {
    const cache = new Cache();

    cache.register('settings', { timeout: 'inf' });
    cache.set('settings', { theme: 'light' });

    vi.advanceTimersByTime(10_000);
    expect(cache.has('settings')).toBe(true);
    expect(cache.get('settings')).toEqual({ theme: 'light' });

    cache.reset('settings');
    expect(cache.has('settings')).toBe(false);
    expect(cache.get('settings')).toBeNull();
  });

  it('deregisters keys completely', () => {
    const cache = new Cache();

    cache.register('token', { timeout: 100 });
    cache.set('token', 'abc');
    cache.deregister('token');

    expect(cache.has('token')).toBe(false);
    expect(() => cache.get('token')).toThrow('The key token is not registered in the cache');
  });

  it('throws when mutating an unregistered key', () => {
    const cache = new Cache();

    expect(() => cache.set('missing', 1)).toThrow('The key missing is not registered in the cache');
    expect(() => cache.get('missing')).toThrow('The key missing is not registered in the cache');
    expect(() => cache.reset('missing')).toThrow('The key missing is not registered in the cache');
  });
});
