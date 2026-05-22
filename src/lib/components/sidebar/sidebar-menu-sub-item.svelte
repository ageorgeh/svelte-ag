<script lang="ts">
  import type { WithElementRef } from 'bits-ui';
  import type { HTMLAttributes } from 'svelte/elements';

  import { cn } from '$utils';

  let {
    ref = $bindable(null),
    children,
    class: className,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLLIElement>> = $props();
</script>

<li bind:this={ref} data-sidebar="menu-sub-item" {...restProps} class={cn('relative', className)}>
  {@render children?.()}
</li>
