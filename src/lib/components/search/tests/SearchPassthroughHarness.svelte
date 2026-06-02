<script lang="ts">
  import { Search } from '../index.js';

  let {
    items,
    value = $bindable(),
    rootClass,
    rootTestId,
    inputClass,
    inputLabel,
    inputTestId,
    listClass,
    listTestId,
    paginationClass,
    paginationTestId,
    perPage = $bindable(1)
  }: {
    items: Search.RootProps['items'];
    value: Search.RootProps['value'];
    rootClass?: string;
    rootTestId?: string;
    inputClass?: string;
    inputLabel?: string;
    inputTestId?: string;
    listClass?: string;
    listTestId?: string;
    paginationClass?: string;
    paginationTestId?: string;
    perPage?: Search.PagnationProps['perPage'];
  } = $props();
</script>

{#snippet itemSnippet(item: NonNullable<Search.RootProps['items']>[number])}
  <span>{item.label}</span>
{/snippet}

<Search.Root {items} bind:value class={rootClass} data-testid={rootTestId}>
  <Search.Input class={inputClass} aria-label={inputLabel} data-testid={inputTestId} />
  <Search.List item={itemSnippet} class={listClass} data-testid={listTestId} />
  <Search.Pagnation bind:perPage class={paginationClass} data-testid={paginationTestId} />
</Search.Root>
