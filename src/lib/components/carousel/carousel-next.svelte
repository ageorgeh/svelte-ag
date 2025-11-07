<script lang="ts">
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import type { WithoutChildren } from 'bits-ui';
  import { getEmblaContext } from './context.js';
  import { cn } from '$utils/utils.js';
  import { Button, type Props } from '$shadcn/button/index.js';
  import { tv, type VariantProps } from 'tailwind-variants';

  let {
    ref = $bindable(null),
    class: className,
    variant = 'outline',
    size = 'icon',
    position = 'default',
    symbol = undefined,
    onclick,
    ...restProps
  }: WithoutChildren<Props> & { symbol?: symbol; position: VariantProps<typeof variants>['variant'] } = $props();

  const emblaCtx = getEmblaContext('<Carousel.Next/>', symbol);
  const variants = tv({
    base: 'size-8 touch-manipulation rounded-full',
    variants: {
      variant: {
        default:
          emblaCtx.orientation === 'horizontal'
            ? 'top-1/2 -right-12 -translate-y-1/2'
            : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
        flex: ``
      }
    }
  });
</script>

<Button
  {variant}
  {size}
  class={cn(variants({ variant: position }), className)}
  disabled={!emblaCtx.canScrollNext}
  onclick={(e) => {
    emblaCtx.scrollNext();
    onclick?.(e);
  }}
  onkeydown={emblaCtx.handleKeyDown}
  bind:ref
  {...restProps}
>
  <ArrowRight class="size-4" />
  <span class="sr-only">Next slide</span>
</Button>
