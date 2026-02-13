<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  import { pixelScale, clamp } from './utils.js';
  import { intersectionObserver } from './intersectionObserver.js';
  import { devicePixelResizeObserver, type DevicePixelResizeEvent } from './devicePixelResizeObserver.js';

  type Props = {
    width?: string;
    height?: string;
    canRender: boolean;
    maxSize: number;
    render: () => void | Promise<void>;
    rerenderEveryFrame: boolean;
    forceAnimation: boolean;
    offsetFromBottom?: boolean;
    updateCanvasSize?: (canvasWidth: number, canvasHeight: number) => void | Promise<void>;
    updateContainerSize: (containerWidth: number, containerHeight: number) => void | Promise<void>;
    updateOffset: (offsetX: number, offsetY: number) => void | Promise<void>;
    updateScale: (scale: number) => void | Promise<void>;
    updateTime: (time: number) => void | Promise<void>;
    canvasElement: HTMLCanvasElement | null;
    requestRender: () => void;
    children?: Snippet;
  };

  let {
    width,
    height,
    canRender,
    maxSize,
    render,
    rerenderEveryFrame,
    forceAnimation,
    offsetFromBottom = false,
    updateCanvasSize = () => {},
    updateContainerSize,
    updateOffset,
    updateScale,
    updateTime,
    canvasElement = $bindable(),
    requestRender = $bindable(),
    children
  }: Props = $props();

  function prefersReducedMotion() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  const shouldRerenderEveryFrame = $derived(forceAnimation || !prefersReducedMotion() ? rerenderEveryFrame : false);

  let mountTime = 0;
  onMount(() => {
    mountTime = performance.now() / 1000;
  });

  let containerElement = $state<HTMLElement | null>(null);

  let requestHandle: number | null = null;
  const renderCallbacks: Array<() => void> = [];

  requestRender = () => {
    if (!canRender) return;
    if (requestHandle !== null) return;

    requestHandle = requestAnimationFrame(() => {
      renderCallbacks.forEach((callback) => callback());
      renderCallbacks.length = 0;

      if (shouldRerenderEveryFrame) updateTime(performance.now() / 1000 - mountTime);

      render();

      requestHandle = null;

      if (shouldRerenderEveryFrame) requestRender();
    });
  };

  function cancelRender() {
    if (requestHandle !== null) {
      cancelAnimationFrame(requestHandle);
      requestHandle = null;
    }
  }

  function updateCanvasSizeInner(event: DevicePixelResizeEvent) {
    if (!canvasElement) return;
    const nextCanvasElement = canvasElement;

    // Resizing must happen right before the next render pass.
    renderCallbacks.push(() => {
      const canvasWidth = event.detail.width;
      const canvasHeight = event.detail.height;

      nextCanvasElement.width = canvasWidth;
      nextCanvasElement.height = canvasHeight;

      updateCanvasSize(canvasWidth, canvasHeight);
    });

    requestRender();
  }

  function updateContainerSizeInner(event: DevicePixelResizeEvent) {
    const canvasWidth = event.detail.width;
    const canvasHeight = event.detail.height;

    updateContainerSize(canvasWidth, canvasHeight);
  }

  let offsetX = $state(0);
  let offsetY = $state(0);

  $effect(() => {
    updateOffset(offsetX, offsetY);
  });

  $effect(() => {
    updateScale($pixelScale);
  });

  function updateCanvasCutout() {
    if (!containerElement || !canvasElement) return;

    const containerRect = containerElement.getBoundingClientRect();

    const windowSizeX = window.innerWidth;
    const canvasSizeX = canvasElement.offsetWidth;
    const containerSizeX = containerElement.offsetWidth;
    const containerOvershootX = -containerRect.left;
    offsetX =
      clamp(0, containerOvershootX - (canvasSizeX - windowSizeX) / 2, containerSizeX - canvasSizeX) * $pixelScale;

    const windowSizeY = window.innerHeight;
    const canvasSizeY = canvasElement.offsetHeight;
    const containerSizeY = containerElement.offsetHeight;
    const containerOvershootY = offsetFromBottom
      ? containerRect.top + containerSizeY - windowSizeY
      : -containerRect.top;
    offsetY =
      clamp(0, containerOvershootY - (canvasSizeY - windowSizeY) / 2, containerSizeY - canvasSizeY) * $pixelScale;
  }

  onDestroy(cancelRender);
</script>

{#if canRender}
  <div
    bind:this={containerElement}
    use:devicePixelResizeObserver
    ondevicepixelresize={updateContainerSizeInner}
    use:intersectionObserver
    onintersectionchanged={updateCanvasCutout}
    style:--width={width}
    style:--height={height}
  >
    <canvas
      bind:this={canvasElement}
      use:devicePixelResizeObserver
      ondevicepixelresize={updateCanvasSizeInner}
      use:intersectionObserver={{ rootMargin: '100px' }}
      onintersectionchanged={updateCanvasCutout}
      class:offset-from-bottom={offsetFromBottom}
      style:--max-size="{maxSize / $pixelScale}px"
      style:--offset-x="{offsetX / $pixelScale}px"
      style:--offset-y="{offsetY / $pixelScale}px"
    >
      {@render children?.()}
    </canvas>
  </div>
{:else}
  {@render children?.()}
{/if}

<style>
  div {
    position: relative;
    width: var(--width, 100%);
    height: var(--height, 100%);
  }

  canvas {
    /* Fix bottom spacing */
    display: block;

    width: 100%;
    height: 100%;
    max-width: var(--max-size);
    max-height: var(--max-size);

    position: absolute;
    left: var(--offset-x);

    top: var(--offset-y);
  }

  canvas.offset-from-bottom {
    top: unset;
    bottom: var(--offset-y);
  }
</style>
