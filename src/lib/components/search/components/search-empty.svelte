<script lang="ts">
  import { box, mergeProps } from 'svelte-toolbelt';
  import type { SearchEmptyProps } from '../types';
  import { useId } from 'bits-ui';
  import { useSearchEmpty } from '../search.svelte';
  import { cn } from '$utils';

  let { children, child, id = useId(), ref = $bindable(null), ...restProps }: SearchEmptyProps = $props();

  const emptyState = useSearchEmpty({
    id: box.with(() => id),
    ref: box.with(
      () => ref,
      (v) => (ref = v)
    )
  });

  const mergedProps = $derived(mergeProps(restProps, emptyState.props));
</script>

{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <div {...mergedProps} class={cn('w-full py-4 text-center', mergedProps.class)}>
    <p>No results found</p>
    {@render children?.()}
  </div>
{/if}
