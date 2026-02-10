<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import type { WithoutChildren } from 'bits-ui';
  import { getEmblaContext } from './context.js';
  import { cn } from '$utils/utils.js';
  import { Button, type Props } from '$shadcn/button/index.js';
  import { type VariantProps, tv } from 'tailwind-variants';

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

  const emblaCtx = $derived(getEmblaContext('<Carousel.Previous/>', symbol));
  const variants = $derived(
    tv({
      base: 'size-8 touch-manipulation rounded-full',
      variants: {
        variant: {
          default:
            emblaCtx.orientation === 'horizontal'
              ? 'top-1/2 -left-12 -translate-y-1/2'
              : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
          flex: ``
        }
      }
    })
  );
</script>

<Button
  {variant}
  {size}
  class={cn(variants({ variant: position }), className)}
  disabled={!emblaCtx.canScrollPrev}
  onclick={(e) => {
    emblaCtx.scrollPrev();
    onclick?.(e as any);
  }}
  onkeydown={emblaCtx.handleKeyDown}
  {...restProps}
  bind:ref
>
  <ArrowLeft class="size-4" />
  <span class="sr-only">Previous slide</span>
</Button>
