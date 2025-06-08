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
  <div {...mergedProps} class="flex w-full flex-col items-center justify-center">
    {#each listState.suggestions as listItem (listItem.value)}
      <Button
        variant="ghost"
        class={cn(
          `
            hover:bg-muted
            flex h-fit w-8/10 cursor-pointer rounded-md p-2
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
