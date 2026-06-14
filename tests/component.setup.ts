import { cleanup } from '@testing-library/svelte';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

if (!Element.prototype.animate) {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      cancel: vi.fn(),
      commitStyles: vi.fn(),
      finish: vi.fn(),
      finished: Promise.resolve(),
      pause: vi.fn(),
      persist: vi.fn(),
      play: vi.fn(),
      reverse: vi.fn()
    }))
  });
}
