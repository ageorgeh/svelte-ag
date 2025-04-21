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
  import { tick } from 'svelte';

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
  let growHeightElement: HTMLDivElement;

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

  // Duration in ms for animations
  const durationMap = {
    fast: 150,
    default: 200,
    slow: 500
  };

  async function animateHeight() {
    if (!growHeightElement) return;

    const durationMs = durationMap[duration || 'default'];
    growHeightElement.style.overflow = 'hidden';

    if (visible) {
      // First set height to 0 and make visible for measurement
      growHeightElement.style.height = '0px';
      // growHeightElement.style.opacity = '0';
      growHeightElement.style.display = 'block';

      await tick(); // Wait for render

      const targetHeight = growHeightElement.scrollHeight;

      // Start animation
      const startTime = performance.now();
      const animate = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        growHeightElement.style.height = `${targetHeight * progress}px`;
        // growHeightElement.style.opacity = `${progress}`;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation complete
          growHeightElement.style.height = 'auto';
          onAnimationComplete?.(true);
        }
      };

      requestAnimationFrame(animate);
    } else {
      // Get current height before collapsing
      const startHeight = growHeightElement.offsetHeight;
      growHeightElement.style.height = `${startHeight}px`;

      // Start animation
      const startTime = performance.now();
      const animate = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        growHeightElement.style.height = `${startHeight * (1 - progress)}px`;
        // growHeightElement.style.opacity = `${1 - progress}`;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          growHeightElement.style.display = 'none';
          onAnimationComplete?.(false);
        }
      };

      requestAnimationFrame(animate);
    }
  }

  $effect(() => {
    if (animation === 'growHeight') {
      animateHeight();
    }
  });
</script>

{#if animation === 'growHeight'}
  <div
    bind:this={growHeightElement}
    class={cn(animatedVariants({ animation, duration }), className)}
    data-state={dataState}
  >
    {@render children?.()}
  </div>
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
