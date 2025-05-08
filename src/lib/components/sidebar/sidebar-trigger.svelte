<script lang="ts">
  import { Button } from '$shadcn/button/index.js';
  import { cn } from '$shadcn/utils.js';
  import PanelLeft from '@lucide/svelte/icons/panel-left';
  import type { ComponentProps } from 'svelte';
  import { useSidebar } from './context.svelte.js';

  let {
    ref = $bindable(null),
    side = 'left',
    class: className,
    onclick,
    ...restProps
  }: ComponentProps<typeof Button> & {
    onclick?: (e: MouseEvent) => void;
    side?: 'left' | 'right';
  } = $props();

  const sidebar = useSidebar();
</script>

<Button
  type="button"
  onclick={(e) => {
    onclick?.(e);
    sidebar.toggle(side);
  }}
  data-sidebar="trigger"
  variant="ghost"
  size="icon"
  class={cn('h-7 w-7', className)}
  {...restProps}
>
  <PanelLeft />
  <span class="sr-only">Toggle Sidebar</span>
</Button>
