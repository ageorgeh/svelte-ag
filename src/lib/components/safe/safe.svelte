<script lang="ts">
  import type { WithElementRef } from 'svelte-toolbelt';

  import { cn, type HTMLDivAttributes } from '$utils';

  export type Props = WithElementRef<HTMLDivAttributes> & {
    links?: boolean;
  };

  let { links = true, class: className = '', children }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={cn(className)}
  onclick={(e) => {
    if (!links) return;
    e.preventDefault();
    e.stopPropagation();
  }}
>
  {@render children?.()}
</div>
