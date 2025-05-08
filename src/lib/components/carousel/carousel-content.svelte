<script lang="ts">
  import emblaCarouselSvelte from 'embla-carousel-svelte';
  import type { WithElementRef } from 'bits-ui';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getEmblaContext } from './context.js';
  import { cn } from '$shadcn/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    children,
    symbol = undefined,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & { symbol?: symbol } = $props();

  const emblaCtx = getEmblaContext('<Carousel.Content/>', symbol);

  // console.log(emblaCtx);
</script>

<!-- svelte-ignore event_directive_deprecated -->
<div
  class="overflow-hidden"
  use:emblaCarouselSvelte={{
    options: {
      container: `[data-embla-container="${symbol?.description ?? 'default'}"]`,
      loop: true,
      slides: `[data-embla-slide="${symbol?.description ?? 'default'}"]`,
      ...emblaCtx.options,
      axis: emblaCtx.orientation === 'horizontal' ? 'x' : 'y'
    },
    plugins: emblaCtx.plugins
  }}
  on:emblaInit={emblaCtx.onInit}
>
  <div
    bind:this={ref}
    class={cn('flex', emblaCtx.orientation === 'horizontal' ? '-ml-4' : `-mt-4 flex-col`, className)}
    data-embla-container={symbol?.description}
    {...restProps}
  >
    {@render children?.()}
  </div>
</div>
