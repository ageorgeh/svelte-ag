if (typeof (globalThis as { $state?: unknown }).$state !== 'function') {
  (globalThis as { $state: <T>(value: T) => T }).$state = <T>(value: T): T => value;
}
