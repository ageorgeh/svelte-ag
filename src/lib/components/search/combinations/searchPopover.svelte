<script lang="ts" module>
  export type SearchPopoverProps = {
    items?: Search.RootProps['items'];
    perPage?: Search.PagnationProps['perPage'];
    item: Search.ListProps['item'];
    value: Search.RootProps['value'];
    search?: Search.RootProps['search'];
    trigger?: HTMLElement | null;
  } & Omit<PopoverTriggerProps, 'value'>;
</script>

<script lang="ts">
  import { Search } from '../index.js';
  import { Button } from '$shadcn/button/index.js';
  import * as Popover from '$shadcn/popover/index.js';
  import type { PopoverTriggerProps } from 'bits-ui';
  import { cn } from '$utils/index.js';

  let {
    items,
    value = $bindable(),
    perPage = $bindable(2),
    ref = $bindable(null),
    trigger = $bindable(null),
    item,
    search,
    class: className,
    ...restProps
  }: SearchPopoverProps = $props();

  let searchPagnation = $state<Search.Pagnation | null>(null);

  export function focus() {
    if (trigger) {
      trigger.focus();
    }
  }

  export { searchPagnation };

  // TODO make focus-ring a common style thing and include it in each project that uses this package
</script>

<Popover.Root>
  <Popover.Trigger {...restProps}>
    {#snippet child({ props })}
      <Button
        bind:ref={trigger}
        variant="outline"
        class={cn('focus-ring h-fit w-full justify-between overflow-hidden', className)}
        {...props}
        role="combobox"
      >
        {#if value}
          {@render item(value)}
        {:else}
          Select an item...
        {/if}
        <span class="icon-[lucide--chevrons-up-down] ml-2 size-4 shrink-0 opacity-50"> </span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-fit p-0">
    <Search.Root {items} bind:value {search}>
      <Search.Input bind:ref></Search.Input>
      <Search.List {item}></Search.List>
      <Search.Pagnation bind:this={searchPagnation} bind:perPage></Search.Pagnation>
    </Search.Root>
  </Popover.Content>
</Popover.Root>
