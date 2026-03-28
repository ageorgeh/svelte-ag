export class RateLimiter {
  #nextStart = 0;
  #interval = 100;

  add<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const startAt = Math.max(now, this.#nextStart);
    this.#nextStart = startAt + this.#interval;

    return (async () => {
      const wait = Math.max(0, startAt - Date.now());

      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }

      return await fn();
    })();
  }
}
