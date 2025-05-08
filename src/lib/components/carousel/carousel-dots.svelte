<script lang="ts">
  import type { WithoutChildren } from 'bits-ui';
  import { getEmblaContext } from './context.js';
  import { cn } from '$shadcn/utils.js';
  import { Button, type Props } from '$shadcn/button/index.js';

  let {
    ref = $bindable(null),
    class: className,
    variant = 'outline',
    size = 'icon',
    symbol = undefined,
    ...restProps
  }: WithoutChildren<Props> & { symbol?: symbol } = $props();

  const emblaCtx = getEmblaContext('<Carousel.Next/>', symbol);
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
