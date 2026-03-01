<script lang="ts">
  import { cn } from '$utils/utils.js';
  import type { WithElementRef } from 'bits-ui';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();

  //       peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))]
</script>

<main
  bind:this={ref}
  class={cn(
    'relative flex flex-1 flex-col bg-background',
    `
      md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl
      md:peer-data-[variant=inset]:shadow-sm
      md:peer-data-[open=false]:peer-data-[variant=inset]:ml-2
    `,
    className
  )}
  {...restProps}
>
  {@render children?.()}
</main>
