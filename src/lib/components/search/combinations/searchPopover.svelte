<script lang="ts" module>
  export type SearchPopoverProps = {
    items?: Search.RootProps['items'];
    perPage?: Search.PagnationProps['perPage'];
    item: Search.ListProps['item'];
    value?: Search.RootProps['value'];
    search?: Search.RootProps['search'];
  };
</script>

<script lang="ts">
  import { Search } from '../index.js';
  import { Button } from '$shadcn/button/index.js';
  import * as Popover from '$shadcn/popover/index.js';

  let { items, value = $bindable(), perPage = $bindable(2), item, search }: SearchPopoverProps = $props();

  let searchPagnation = $state<Search.Pagnation | null>(null);

  export { searchPagnation };
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" class="w-full justify-between overflow-hidden" {...props} role="combobox">
        {#if value}
          {@render item({ value: value, label: value })}
        {:else}
          Select an item...
        {/if}
        <span class="icon-[lucide--chevrons-up-down] ml-2 size-4 shrink-0 opacity-50"> </span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-fit p-0">
    <Search.Root {items} bind:value {search}>
      <Search.Input></Search.Input>
      <Search.List {item}></Search.List>
      <Search.Pagnation bind:this={searchPagnation} bind:perPage></Search.Pagnation>
    </Search.Root>
  </Popover.Content>
</Popover.Root>
