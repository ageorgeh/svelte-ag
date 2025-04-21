<script lang="ts">
  import { box, mergeProps } from 'svelte-toolbelt';
  import type { SearchProps } from '../types';
  import { useId } from 'bits-ui';
  import { useSearchRoot } from '../search.svelte';
  import { cn } from '$utils';

  let {
    children,
    child,
    id = useId(),
    ref = $bindable(null),
    searchWith = $bindable(),
    search,
    value = $bindable(),
    items = $bindable([]),
    ...restProps
  }: SearchProps = $props();

  const rootState = useSearchRoot({
    id: box.with(() => id),
    ref: box.with(
      () => ref,
      (v) => (ref = v)
    ),
    searchWith: box.with(() => searchWith),
    value: box.with(
      () => value,
      (v) => (value = v)
    ),
    items: box.with(
      () => items,
      (v) => (items = v)
    ),
    search: box.with(() => search)
  });

  const mergedProps = $derived(mergeProps(restProps, rootState.props));
</script>

{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <div {...mergedProps} class={cn('flex flex-col items-center gap-2', mergedProps.class)}>
    {@render children?.()}
  </div>
{/if}
