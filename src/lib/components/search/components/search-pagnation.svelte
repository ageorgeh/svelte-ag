<script lang="ts">
  import { box, mergeProps } from 'svelte-toolbelt';
  import type { SearchPagnationProps } from '../types';
  import { useId } from 'bits-ui';
  import { useSearchPagnation } from '../search.svelte';
  import { cn } from '$utils';
  import * as Pagination from '$shadcn/pagination/index.js';

  let {
    children,
    child,
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
  <Pagination.Root class="pb-2" count={pagnationState.length} perPage={pagnationState.perPage} bind:page>
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
            <Pagination.Item isVisible={currentPage === page.value}>
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
