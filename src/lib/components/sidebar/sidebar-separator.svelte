<script lang="ts">
  import { Separator } from '$shadcn/separator/index.js';
  import { cn } from '$utils/utils.js';
  import type { ComponentProps } from 'svelte';

  let { ref = $bindable(null), class: className, ...restProps }: ComponentProps<typeof Separator> = $props();
</script>

<Separator bind:ref data-sidebar="separator" class={cn('mx-2 w-auto bg-sidebar-border', className)} {...restProps} />
