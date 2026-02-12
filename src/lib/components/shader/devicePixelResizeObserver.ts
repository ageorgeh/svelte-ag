import type { ActionReturn } from 'svelte/action';

export type DevicePixelResizeEvent = CustomEvent<{ width: number; height: number }>;

type Attributes = {
  'on:devicepixelresize'?: (e: DevicePixelResizeEvent) => void;
};

/**
 * Check if "devicePixelContentBoxSize" is supported (it's not in Safari).
 */
async function checkDevicePixelContentBox(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const observer = new ResizeObserver((entries) => {
      resolve(entries.every((entry) => 'devicePixelContentBoxSize' in entry));
      observer.disconnect();
    });

    observer.observe(document.body, { box: 'device-pixel-content-box' });
  }).catch(() => false);
}

const hasDevicePixelContentBoxPromise = checkDevicePixelContentBox();
let hasDevicePixelContentBox = false;

/**
 * Observe all changes to the device-pixel-content-box of a node.
 */
export function devicePixelResizeObserver(node: Element): ActionReturn<void, Attributes> {
  const observer = new ResizeObserver(callback);

  function callback(entries: ResizeObserverEntry[]) {
    const entry = entries[0];

    let detail: { width: number; height: number };
    if (hasDevicePixelContentBox) {
      detail = {
        width: entry.devicePixelContentBoxSize[0].inlineSize,
        height: entry.devicePixelContentBoxSize[0].blockSize
      };
    } else if (entry.contentBoxSize) {
      // Not perfect, but it's the best we can do in this case.
      detail = {
        width: entry.contentBoxSize[0].inlineSize * window.devicePixelRatio,
        height: entry.contentBoxSize[0].blockSize * window.devicePixelRatio
      };
    } else {
      // Fallback for older browsers without contentBoxSize support
      detail = {
        width: entry.contentRect.width * window.devicePixelRatio,
        height: entry.contentRect.height * window.devicePixelRatio
      };
    }

    node.dispatchEvent(new CustomEvent('devicepixelresize', { detail }));
  }

  hasDevicePixelContentBoxPromise.then((result) => {
    hasDevicePixelContentBox = result;
    observer.observe(node, {
      box: hasDevicePixelContentBox ? 'device-pixel-content-box' : 'content-box'
    });
  });

  return {
    destroy() {
      observer.disconnect();
    }
  };
}
