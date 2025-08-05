import { SvelteMap } from 'svelte/reactivity';

export class Cache {
  #cache = new SvelteMap<string, { timeout: number | 'inf'; updatedAt: EpochTimeStamp | null; value: any | null }>();
  constructor() {}

  deregister(key: string) {
    if (this.#cache.has(key)) {
      this.#cache.delete(key);
    }
  }

  register(key: string, opts: { timeout: number | 'inf' }) {
    if (!this.#cache.has(key)) {
      this.#cache.set(key, { ...opts, updatedAt: null, value: null });
    }
  }

  set(key: string, value: any) {
    const details = this.#cache.get(key);
    if (!details) throw new Error(`The key ${key} is not registered in the cache`);

    details.updatedAt = Date.now();
    details.value = value;
  }

  get(key: string) {
    const details = this.#cache.get(key);
    if (!details) throw new Error(`The key ${key} is not registered in the cache`);

    if (details.updatedAt !== null && (details.timeout === 'inf' || details.updatedAt + details.timeout > Date.now())) {
      // Return cached value if its within the timeout or timeout is inf
      return details.value;
    }

    return null;
  }

  has(key: string) {
    const details = this.#cache.get(key);
    if (!details) return false;

    if (details.updatedAt !== null && (details.timeout === 'inf' || details.updatedAt + details.timeout > Date.now())) {
      // Return cached value if its within the timeout or timeout is inf
      return true;
    }

    return false;
  }
}
