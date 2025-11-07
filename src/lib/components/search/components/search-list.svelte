<script lang="ts">
  import { box, mergeProps } from 'svelte-toolbelt';
  import type { SearchListProps } from '../types';
  import { useId } from 'bits-ui';
  import { useSearchList } from '../search.svelte';
  import { cn } from '$utils';
  import { Button } from '$shadcn/button/index.js';

  let { children, child, id = useId(), ref = $bindable(null), item, ...restProps }: SearchListProps = $props();

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
  <div {...mergedProps} class="grid w-full auto-rows-fr px-2">
    {#each listState.suggestions as listItem (listItem.value)}
      <Button
        variant="ghost"
        class={cn(
          `
            hover:bg-muted
            flex h-full min-h-fit w-full min-w-fit flex-1 cursor-pointer rounded-md p-2
          `,
          listState.selected(listItem) && 'bg-muted',
          listState.visible(listItem) ? '' : 'hidden!',
          mergedProps.class
        )}
        onclick={() => listState.select(listItem)}
      >
        {@render item(listItem)}
      </Button>
    {/each}

    {@render children?.()}
  </div>
{/if}
