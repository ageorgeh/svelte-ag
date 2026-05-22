<script lang="ts">
  import type { WithoutChildren } from 'bits-ui';

  import { type Props } from '$shadcn/button/index.js';
  import { cn } from '$utils/utils.js';

  import { getEmblaContext } from './context.js';

  let {
    ref = $bindable(null),
    class: className,
    symbol = undefined
  }: WithoutChildren<Props> & { symbol?: symbol } = $props();

  const emblaCtx = $derived(getEmblaContext('<Carousel.Dots/>', symbol));
</script>

<div class={cn('flex justify-center gap-1.5', className)}>
  {#each Array(emblaCtx.scrollSnaps.length) as _, i (i)}
    <div
      class={cn(
        'size-2 rounded-full transition-colors duration-300',
        emblaCtx.selectedIndex === i ? `bg-foreground` : `bg-foreground/20`
      )}
    ></div>
  {/each}
</div>
