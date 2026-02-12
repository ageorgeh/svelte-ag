<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import { pixelScale, clamp } from './utils.js';
  import { intersectionObserver } from './intersectionObserver.js';
  import { devicePixelResizeObserver, type DevicePixelResizeEvent } from './devicePixelResizeObserver.js';

  export let width: string | undefined;
  export let height: string | undefined;

  export let canRender: boolean;
  export let maxSize: number;
  export let render: () => void | Promise<void>;

  export let rerenderEveryFrame: boolean;
  export let forceAnimation: boolean;

  function prefersReducedMotion() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  if (!forceAnimation && prefersReducedMotion()) rerenderEveryFrame = false;

  let mountTime = 0;
  onMount(() => {
    mountTime = performance.now() / 1000;
  });

  export let offsetFromBottom = false;

  export let updateCanvasSize: (canvasWidth: number, canvasHeight: number) => void | Promise<void> = () => {};
  export let updateContainerSize: (containerWidth: number, containerHeight: number) => void | Promise<void>;
  export let updateOffset: (offsetX: number, offsetY: number) => void | Promise<void>;
  export let updateScale: (scale: number) => void | Promise<void>;
  export let updateTime: (time: number) => void | Promise<void>;

  let containerElement: HTMLElement;
  export let canvasElement: HTMLCanvasElement;

  let requestHandle: number | null = null;
  const renderCallbacks: Array<() => void> = [];

  export let requestRender: () => void;
  requestRender = () => {
    if (!canRender) return;
    if (requestHandle !== null) return;

    requestHandle = requestAnimationFrame(() => {
      renderCallbacks.forEach((callback) => callback());
      renderCallbacks.length = 0;

      if (rerenderEveryFrame) updateTime(performance.now() / 1000 - mountTime);

      render();

      requestHandle = null;

      if (rerenderEveryFrame) requestRender();
    });
  };

  function cancelRender() {
    if (requestHandle !== null) {
      cancelAnimationFrame(requestHandle);
      requestHandle = null;
    }
  }

  function updateCanvasSizeInner(event: DevicePixelResizeEvent) {
    // Resizing must happen right before the next render pass.
    renderCallbacks.push(() => {
      const canvasWidth = event.detail.width;
      const canvasHeight = event.detail.height;

      canvasElement.width = canvasWidth;
      canvasElement.height = canvasHeight;

      updateCanvasSize(canvasWidth, canvasHeight);
    });

    requestRender();
  }

  function updateContainerSizeInner(event: DevicePixelResizeEvent) {
    const canvasWidth = event.detail.width;
    const canvasHeight = event.detail.height;

    updateContainerSize(canvasWidth, canvasHeight);
  }

  let offsetX = 0;
  let offsetY = 0;

  $: if (offsetX !== undefined && offsetY !== undefined) updateOffset(offsetX, offsetY);
  $: updateScale($pixelScale);

  function updateCanvasCutout() {
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
    on:devicepixelresize={updateContainerSizeInner}
    use:intersectionObserver
    on:intersectionchanged={updateCanvasCutout}
    style:--width={width}
    style:--height={height}
  >
    <canvas
      bind:this={canvasElement}
      use:devicePixelResizeObserver
      on:devicepixelresize={updateCanvasSizeInner}
      use:intersectionObserver={{ rootMargin: '100px' }}
      on:intersectionchanged={updateCanvasCutout}
      class:offset-from-bottom={offsetFromBottom}
      style:--max-size="{maxSize / $pixelScale}px"
      style:--offset-x="{offsetX / $pixelScale}px"
      style:--offset-y="{offsetY / $pixelScale}px"
    >
      <slot></slot>
    </canvas>
  </div>
{:else}
  <slot></slot>
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
