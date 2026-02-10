<script lang="ts">
  import type { WithElementRef } from 'bits-ui';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getEmblaContext } from './context.js';
  import { cn } from '$utils/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    children,
    symbol = undefined,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & { symbol?: symbol } = $props();

  const emblaCtx = $derived(getEmblaContext('<Carousel.Content/>', symbol));
</script>

<div
  bind:this={ref}
  class={cn('flex', emblaCtx.orientation === 'horizontal' ? '-ml-4' : `-mt-4 flex-col`, className)}
  data-embla-container={symbol?.description ?? 'default'}
  {...restProps}
>
  {@render children?.()}
</div>
