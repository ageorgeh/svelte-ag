import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

type FlyAndScaleParams = {
  y?: number;
  x?: number;
  start?: number;
  duration?: number;
  delay?: number;
};

export const flyAndScale = (
  node: Element,
  params: FlyAndScaleParams = { y: -8, x: 0, start: 0.95, duration: 200, delay: 0 }
): TransitionConfig => {
  const style = getComputedStyle(node);
  const transform = style.transform === 'none' ? '' : style.transform;

  const scaleConversion = (valueA: number, scaleA: [number, number], scaleB: [number, number]) => {
    const [minA, maxA] = scaleA;
    const [minB, maxB] = scaleB;

    const percentage = (valueA - minA) / (maxA - minA);
    const valueB = percentage * (maxB - minB) + minB;

    return valueB;
  };

  const styleToString = (style: Record<string, number | string | undefined>): string => {
    return Object.keys(style).reduce((str, key) => {
      if (style[key] === undefined) return str;
      return str + key + ':' + style[key] + ';';
    }, '');
  };

  return {
    duration: params.duration ?? 200,
    delay: params.delay ?? 0,
    css: (t) => {
      const y = scaleConversion(t, [0, 1], [params.y ?? 5, 0]);
      const x = scaleConversion(t, [0, 1], [params.x ?? 0, 0]);
      const scale = scaleConversion(t, [0, 1], [params.start ?? 0.95, 1]);
      const opacity = t;

      const style: any = {
        transform: transform + 'translate3d(' + x + 'px, ' + y + 'px, 0) scale(' + scale + ')',
        opacity
      };

      if (params.delay && params.delay > 0) {
        const visibility = t === 0 ? 'hidden' : 'visible'; // Hide when fully collapsed
        const position = t === 0 ? 'absolute' : 'relative'; // Remove from the flow at the start
        style.visibility = visibility;
        style.position = position;
      }

      return styleToString(style);
    },
    easing: cubicOut
  };
};

export function flexSlide(node: Element, { duration = 300, easing = cubicOut } = {}) {
  const style = getComputedStyle(node);
  const opacity = +style.opacity;
  const height = parseFloat(style.height);
  const paddingTop = parseFloat(style.paddingTop);
  const paddingBottom = parseFloat(style.paddingBottom);
  const marginTop = parseFloat(style.marginTop);
  const marginBottom = parseFloat(style.marginBottom);
  const borderTopWidth = parseFloat(style.borderTopWidth);
  const borderBottomWidth = parseFloat(style.borderBottomWidth);

  return {
    duration,
    easing,
    css: (t: number) =>
      `overflow: hidden;
			opacity: ${Math.min(t * 20, 1) * opacity};
			flex-grow: ${t};
			height: ${t * height}px;
			padding-top: ${t * paddingTop}px;
			padding-bottom: ${t * paddingBottom}px;
			margin-top: ${t * marginTop}px;
			margin-bottom: ${t * marginBottom}px;
			border-top-width: ${t * borderTopWidth}px;
			border-bottom-width: ${t * borderBottomWidth}px;
			`
  };
}
