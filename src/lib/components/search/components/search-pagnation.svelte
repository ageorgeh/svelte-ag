<script lang="ts">
  import { useId } from 'bits-ui';
  import { box, mergeProps } from 'svelte-toolbelt';

  import * as Pagination from '$shadcn/pagination/index.js';
  import { cn } from '$utils/index.js';

  import { useSearchPagnation } from '../search.svelte';
  import type { SearchPagnationProps } from '../types';

  let {
    child,
    class: className,
    id = useId(),
    ref = $bindable(null),
    page = $bindable(1),
    perPage = $bindable(2),
    ...restProps
  }: SearchPagnationProps = $props();

  const pagnationState = useSearchPagnation({
    id: box.with(() => id),
    ref: box.with(
      () => ref,
      (v) => (ref = v)
    ),
    page: box.with(
      () => page,
      (v) => (page = v)
    ),
    perPage: box.with(
      () => perPage,
      (v) => (perPage = v)
    )
  });

  const mergedProps = $derived(mergeProps(restProps, pagnationState.props));
  let activeItems = $derived(pagnationState.activeItems);
  export { activeItems };
</script>

{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <Pagination.Root
    {...mergedProps}
    class={cn('pb-2', className)}
    count={pagnationState.length}
    perPage={pagnationState.perPage}
    bind:page
  >
    {#snippet children({ pages, currentPage })}
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.PrevButton />
        </Pagination.Item>
        {#each pages as page (page.key)}
          {#if page.type === 'ellipsis'}
            <Pagination.Item>
              <Pagination.Ellipsis />
            </Pagination.Item>
          {:else}
            <Pagination.Item>
              <Pagination.Link {page} isActive={currentPage === page.value}>
                {page.value}
              </Pagination.Link>
            </Pagination.Item>
          {/if}
        {/each}
        <Pagination.Item>
          <Pagination.NextButton />
        </Pagination.Item>
      </Pagination.Content>
    {/snippet}
  </Pagination.Root>
{/if}
