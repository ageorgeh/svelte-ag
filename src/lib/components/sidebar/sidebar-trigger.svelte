<script lang="ts">
  import { Button } from '$shadcn/button/index.js';
  import { cn } from '$utils/utils.js';
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
    console.log('TOggling', side);
    sidebar.toggle(side);
  }}
  data-sidebar="trigger"
  variant="ghost"
  size="icon"
  class={cn('flex h-auto w-auto p-1', className)}
  {...restProps}
>
  <span class="icon-[lucide--panel-left] size-4"></span>
  <span class="sr-only">Toggle Sidebar</span>
</Button>
