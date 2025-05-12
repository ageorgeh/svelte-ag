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
        slow: 'duration-500',
        vSlow: 'duration-1000'
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
  import { watch } from 'runed';

  export type Props = WithElementRef<HTMLDivAttributes> & {
    visible: boolean;
    animation?: AnimatedVariants['animation'];
    duration?: AnimatedVariants['duration'];
    onAnimationComplete?: (visible: boolean) => void;
    disableInitialAnimation?: boolean;
    class?: string;
  };

  let {
    visible = $bindable(true),
    animation = 'flyAndScale',
    duration = 'default',
    onAnimationComplete = undefined,
    disableInitialAnimation = false,
    class: className = '',
    children
  }: Props = $props();

  let animationComplete = $state<boolean>(true);
  let isInitialRender = $state(true);
  //svelte-ignore non_reactive_update
  let growHeightElement: HTMLDivElement | undefined;

  function handleAnimationEnd(e: AnimationEvent) {
    if (!visible) {
      animationComplete = true;
    } else {
      animationComplete = false;
    }

    // Mark initial render as complete after animation
    isInitialRender = false;

    if (onAnimationComplete) {
      onAnimationComplete(visible);
    }
  }

  // Reset animation state when visibility changes
  watch(
    () => visible,
    (newValue) => {
      if (newValue) {
        animationComplete = false;
      }
    },
    { lazy: false }
  );

  // Set initial render to false when component mounts if disableInitialAnimation is true
  $effect(() => {
    if (disableInitialAnimation) {
      isInitialRender = false;
    }
  });

  const dataState = $derived(visible ? 'visible' : 'hidden');
  // Skip animation classes on initial render when disableInitialAnimation is true
  const shouldApplyAnimationClasses = $derived(!isInitialRender || !disableInitialAnimation);

  // Duration in ms for animations
  const durationMap = {
    fast: 150,
    default: 200,
    slow: 500,
    vSlow: 1000
  };

  // Map each animation type to the specific CSS properties that should be transitioned
  function getTransitionProperties(animationType: AnimatedVariants['animation']): string {
    switch (animationType) {
      case 'flyAndScale':
        return 'transition-opacity transition-transform';
      case 'slide':
        return 'transition-transform';
      case 'fade':
        return 'transition-opacity';
      case 'zoom':
        return 'transition-transform';
      case 'slideUp':
      case 'slideDown':
        return 'transition-transform';
      case 'growHeight':
        return 'transition-height';
      default:
        return 'transition';
    }
  }

  async function animateHeight() {
    if (!growHeightElement) return;

    // Skip animation for initial render if disableInitialAnimation is true
    if (isInitialRender && disableInitialAnimation) {
      growHeightElement.style.display = visible ? 'block' : 'none';
      growHeightElement.style.height = visible ? 'auto' : '0px';
      isInitialRender = false;
      return;
    }

    const durationMs = durationMap[duration || 'default'];
    growHeightElement.style.overflow = 'hidden';

    if (visible) {
      // First set height to 0 and make visible for measurement
      growHeightElement.style.height = '0px';
      growHeightElement.style.display = 'block';
      const targetHeight = growHeightElement.scrollHeight;

      await tick(); // Wait for render

      // Start animation
      const startTime = performance.now();
      const animate = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        if (growHeightElement) growHeightElement.style.height = `${targetHeight * progress}px`;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation complete
          if (growHeightElement) growHeightElement.style.height = 'auto';
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

        if (growHeightElement) growHeightElement.style.height = `${startHeight * (1 - progress)}px`;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          if (growHeightElement) growHeightElement.style.display = 'none';
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
    class={cn(
      shouldApplyAnimationClasses ? animatedVariants({ animation, duration }) : '',
      className,
      visible ? 'block' : 'hidden'
    )}
    data-state={dataState}
  >
    {@render children?.()}
  </div>
{:else}
  <div
    class={cn(
      animationComplete && !visible ? 'hidden' : '',
      shouldApplyAnimationClasses ? animatedVariants({ animation, duration }) : '',
      getTransitionProperties(animation),
      className
    )}
    onanimationend={handleAnimationEnd}
    data-state={dataState}
  >
    {@render children?.()}
  </div>
{/if}
