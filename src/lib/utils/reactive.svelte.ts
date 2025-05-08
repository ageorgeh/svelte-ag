import { onDestroy } from 'svelte';

/**
 * Helper function to watch the size of the container element with data-container.
 * 
 * @example
 * ```ts
 let numCols = $state(3);

  onMount(() => {
    containerSize((size) => {
      let cols = 2;
      if (size.width > 640) {
        cols = 3;
      }
      if (size.width > 768) {
        cols = 4;
      }
      numCols = cols;
    });
  });
 */
export function containerSize(func: (size: { width: number; height: number }) => void) {
  const container = document.querySelector('[data-container]') as HTMLDivElement;
  if (!container) return;

  func({ width: container.offsetWidth, height: container.offsetHeight });

  const observer = new ResizeObserver(() => {
    func({ width: container.offsetWidth, height: container.offsetHeight });
  });

  observer.observe(container);

  onDestroy(() => {
    observer.disconnect();
  });
}
