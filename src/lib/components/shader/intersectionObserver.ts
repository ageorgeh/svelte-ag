import { clamp } from './utils.js';
import type { ActionReturn } from 'svelte/action';

export type IntersectionEvent = CustomEvent<IntersectionObserverEntry>;

type Attributes = {
  'on:intersectionchanged'?: (e: IntersectionEvent) => void;
};

/**
 * Observe all changes to the intersection of the given element with the target element, (by default the viewport).
 */
export function intersectionObserver(
  node: Element,
  params?: { root?: Element | Document | null; rootMargin?: string }
): ActionReturn<void, Attributes> {
  let previousThreshold = 0;
  const observerParams: IntersectionObserverInit = {
    ...params,
    threshold: previousThreshold
  };

  let observer = new IntersectionObserver(callback, observerParams);
  observer.observe(node);

  function callback(entries: IntersectionObserverEntry[]) {
    const entry = entries[0];

    if (entry.intersectionRatio === previousThreshold) return;

    node.dispatchEvent(new CustomEvent('intersectionchanged', { detail: entry }));

    previousThreshold = entry.intersectionRatio;
    observer.disconnect();

    // Epsilon is necessary to ensure that the callback is triggered even with weird scaling.
    const epsilon = 0.00001;
    const threshold = [previousThreshold - epsilon, previousThreshold, previousThreshold + epsilon].map((t) =>
      clamp(0, t, 1)
    );

    const nextObserverParams: IntersectionObserverInit = {
      ...params,
      threshold
    };
    observer = new IntersectionObserver(callback, nextObserverParams);
    observer.observe(node);
  }

  return {
    destroy() {
      observer.disconnect();
    }
  };
}
