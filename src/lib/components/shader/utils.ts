import { readable } from 'svelte/store';

/** Ratio between CSS pixels and actual physical pixels */
export const pixelScale =
  typeof window !== 'undefined'
    ? readable(window.devicePixelRatio, (set) => {
        let removePrevious = () => {};

        function updatePixelRatio() {
          removePrevious();
          const queryString = `(resolution: ${window.devicePixelRatio}dppx)`;
          const media = matchMedia(queryString);
          media.addEventListener('change', updatePixelRatio);
          removePrevious = () => media.removeEventListener('change', updatePixelRatio);

          set(window.devicePixelRatio);
        }

        updatePixelRatio();
      })
    : readable(1);

/**
 * Zip two arrays together, returning an array of pairs.
 */
export function zip<A, B>(a: readonly A[], b: readonly B[]): [A, B][] {
  if (a.length !== b.length)
    throw new Error(`Arrays must be of equal length: a.length = ${a.length}, b.length = ${b.length}`);

  return a.map((e, i) => [e, b[i]]);
}

/**
 * Clamp a value between a minimum and maximum.
 */
export function clamp(min: number, value: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
