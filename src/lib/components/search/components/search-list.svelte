<script lang="ts">
  import { useId } from 'bits-ui';
  import { box, mergeProps } from 'svelte-toolbelt';

  import { Button } from '$shadcn/button/index.js';
  import { cn } from '$utils';

  import { useSearchList } from '../search.svelte';
  import type { SearchListProps } from '../types';

  let {
    children,
    child,
    class: className,
    id = useId(),
    ref = $bindable(null),
    item,
    ...restProps
  }: SearchListProps = $props();

  const listState = useSearchList({
    id: box.with(() => id),
    ref: box.with(
      () => ref,
      (v) => (ref = v)
    )
  });

  const mergedProps = $derived(mergeProps(restProps, listState.props));
</script>

{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <div {...mergedProps} class={cn('grid w-full auto-rows-fr px-2', className)}>
    {#each listState.suggestions as listItem (listItem.value)}
      <Button
        variant="ghost"
        class={cn(
          `
            flex h-full min-h-fit w-full min-w-fit flex-1 cursor-pointer rounded-md p-2
            hover:bg-muted
          `,
          listState.selected(listItem) && 'bg-muted',
          listState.visible(listItem) ? '' : 'hidden!'
        )}
        onclick={() => listState.select(listItem)}
      >
        {@render item(listItem)}
      </Button>
    {/each}

    {@render children?.()}
  </div>
{/if}
