<script lang="ts">
  import { cn, type HTMLDivAttributes } from '$utils';
  import type { WithElementRef } from 'svelte-toolbelt';

  export type Props = WithElementRef<HTMLDivAttributes> & {
    links?: boolean;
  };

  let { links = true, class: className = '', children }: Props = $props();

  function blockClick(e) {
    if (!links) return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<div class={cn(className)} onclick={blockClick}>
  {@render children?.()}
</div>
