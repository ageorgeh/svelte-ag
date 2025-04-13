<script lang="ts" module>
  import { tv, type VariantProps } from 'tailwind-variants';

  export const animatedVariants = tv({
    base: 'transition',
    variants: {
      animation: {
        flyAndScale: `
          data-[state="visible"]:animate-in data-[state="visible"]:fade-in-0 data-[state="visible"]:zoom-in-95
          data-[state="visible"]:slide-in-from-bottom-[10%]
          data-[state="hidden"]:animate-out data-[state="hidden"]:fade-out-0 data-[state="hidden"]:zoom-out-95
          data-[state="hidden"]:slide-out-to-bottom-[10%]
        `,
        slide: `
          data-[state="visible"]:animate-in data-[state="visible"]:slide-in-from-right
          data-[state="hidden"]:animate-out data-[state="hidden"]:slide-out-to-right
        `,
        fade: `
          data-[state="visible"]:animate-in data-[state="visible"]:fade-in
          data-[state="hidden"]:animate-out data-[state="hidden"]:fade-out
        `,
        zoom: `
          data-[state="visible"]:animate-in data-[state="visible"]:zoom-in-95
          data-[state="hidden"]:animate-out data-[state="hidden"]:zoom-out-95
        `,
        slideUp: `
          data-[state="visible"]:animate-in data-[state="visible"]:slide-in-from-bottom
          data-[state="hidden"]:animate-out data-[state="hidden"]:slide-out-to-bottom
        `,
        slideDown: `
          data-[state="visible"]:animate-in data-[state="visible"]:slide-in-from-top
          data-[state="hidden"]:animate-out data-[state="hidden"]:slide-out-to-top
        `,
        growHeight: `overflow-hidden`
      },
      duration: {
        fast: 'duration-150',
        default: 'duration-200',
        slow: 'duration-500'
      }
    },
    defaultVariants: {
      animation: 'flyAndScale',
      duration: 'default'
    }
  });

  export type AnimatedVariants = VariantProps<typeof animatedVariants>;
</script>

<script lang="ts">
  import { cn, type HTMLDivAttributes } from '$utils';
  import type { WithElementRef } from 'svelte-toolbelt';
  import { slide } from 'svelte/transition';

  export type Props = WithElementRef<HTMLDivAttributes> & {
    visible: boolean;
    animation?: AnimatedVariants['animation'];
    duration?: AnimatedVariants['duration'];
    onAnimationComplete?: (visible: boolean) => void;
    class?: string;
  };

  let {
    visible = $bindable(true),
    animation = 'flyAndScale',
    duration = 'default',
    onAnimationComplete = undefined,
    class: className = '',
    children
  }: Props = $props();

  let animationComplete = $state<boolean>(true);

  function handleAnimationEnd(e: AnimationEvent) {
    if (!visible) {
      animationComplete = true;
    } else {
      animationComplete = false;
    }

    if (onAnimationComplete) {
      onAnimationComplete(visible);
    }
  }

  $effect(() => {
    // Reset animation complete when visibility changes
    if (visible) {
      animationComplete = false;
    }
  });

  const dataState = $derived(visible ? 'visible' : 'hidden');

  // Duration in ms for Svelte's slide animation
  const slideDurationMap = {
    fast: 150,
    default: 200,
    slow: 500
  };
</script>

{#if animation === 'growHeight'}
  {#if visible}
    <div
      class={cn(animatedVariants({ animation, duration }), className)}
      transition:slide={{ duration: slideDurationMap[duration || 'default'] }}
      onintroend={() => onAnimationComplete?.(true)}
      onoutroend={() => onAnimationComplete?.(false)}
    >
      {@render children?.()}
    </div>
  {/if}
{:else}
  <div
    class={cn(
      animationComplete && !visible ? 'hidden' : '',
      animatedVariants({ animation, duration }),
      'transition-all',
      className
    )}
    onanimationend={handleAnimationEnd}
    data-state={dataState}
  >
    {@render children?.()}
  </div>
{/if}
