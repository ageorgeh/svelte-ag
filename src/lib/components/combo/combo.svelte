<script lang="ts" module>
</script>

<script lang="ts">
  import { cn } from '$utils/utils.js';
  import * as Popover from '$shadcn/popover/index.js';
  import { Button } from '$shadcn/button/index.js';
  import * as Command from '$shadcn/command/index.js';
  import { tick, type Snippet } from 'svelte';
  import { watch } from 'runed';
  import * as Pagination from '$shadcn/pagination/index.js';
  import { Input } from '$shadcn/input/index.js';

  import type { HTMLDivAttributes } from '$utils';
  import CommandInput from '$shadcn/command/command-input.svelte';

  type Props = HTMLDivAttributes & {
    value: string;
    total: number;
    allItems: { label: string; value: string }[];
    activeItems: { label: string; value: string }[];
    itemSnippet: Snippet<[item: { label: string; value: string }]>;
  };

  // TODO move away from command
  // TODO make all items optional in the case where searching should be external
  let {
    value = $bindable(),
    activeItems = $bindable(),
    class: className = '',
    itemSnippet,
    total,
    allItems,
    children,
    ...restProps
  }: Props = $props();

  const itemsPerPage = 2;

  let open = $state(false);
  let triggerRef = $state<HTMLButtonElement>(null!);

  let page = $state(1);
  let start = $state(0);
  let end = $state(Math.min(total, itemsPerPage));

  let searchTerm = $state('');
  let validItems = $state(allItems);

  // Allows total to start as 0 and be set later
  watch(
    () => total,
    () => {
      if (end === 0 && total > 0) {
        end = Math.min(total, itemsPerPage);
      }
    }
  );

  // Change the start and end when the page changes
  $effect(() => {
    start = page * itemsPerPage - itemsPerPage;
    end = Math.min(total, start + itemsPerPage);
  });

  // Get items when the start/end changes
  $effect(() => {
    if (open) {
      activeItems = validItems.slice(start, end);
    } else {
      activeItems = [];
    }
  });

  // Search through all items and set valid items
  $effect(() => {
    if (searchTerm) {
      validItems = allItems.filter((item) => item.label.toLowerCase().includes(searchTerm.toLowerCase()));
    } else {
      validItems = allItems;
    }
  });

  let selectedLabel = $state('');

  // We want to refocus the trigger button when the user selects
  // an item from the list so users can continue navigating the
  // rest of the form with the keyboard.
  function closeAndFocusTrigger() {
    open = false;
    tick().then(() => {
      triggerRef.focus();
    });
  }
</script>

<div {...restProps} class={cn(className)}>
  {@render children?.()}
</div>

<Popover.Root bind:open>
  <Popover.Trigger bind:ref={triggerRef}>
    {#snippet child({ props })}
      <Button variant="outline" class="w-full justify-between" {...props} role="combobox" aria-expanded={open}>
        {selectedLabel || 'Select an item...'}
        <span class="icon-[lucide--chevrons-up-down] opacity-50"></span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-full p-0">
    <Command.Root shouldFilter={false}>
      <CommandInput placeholder="Search item..." bind:value={searchTerm} />
      <!-- <div class="flex items-center border-b px-2" data-command-input-wrapper="">
        <Search class="mr-2 size-4 shrink-0 opacity-50" />
        <Input
          class="
            placeholder:text-muted-foreground
            flex h-11 w-full rounded-md bg-transparent py-3 text-base outline-none
            disabled:cursor-not-allowed disabled:opacity-50
            md:text-sm
          "
          placeholder="Search item..."
          bind:value={searchTerm}
        />
      </div> -->
      <div class="flex flex-col items-center justify-center gap-2 p-1">
        <Command.List
          class="
            scrollbar-thin scrollbar-track-sidebar scrollbar-track-rounded-full scrollbar-thumb-sidebar-accent
            scrollbar-thumb-rounded-full
            scrollbar-hover:scrollbar-thumb-sidebar-primary/30
            scrollbar-active:scrollbar-thumb-sidebar-primary/60
          "
        >
          <Command.Empty>No item found.</Command.Empty>
          <Command.Group>
            {#each activeItems as item (item.value)}
              <Command.Item
                value={item.label}
                onSelect={() => {
                  value = item.value;
                  selectedLabel = item.label;
                  closeAndFocusTrigger();
                }}
              >
                <span class={cn('icon-[lucide--check]', value !== item.value && 'text-transparent')}> </span>

                {#if itemSnippet}
                  {@render itemSnippet(item)}
                {:else}
                  {item.label}
                {/if}
              </Command.Item>
            {/each}
          </Command.Group>
        </Command.List>

        <Pagination.Root count={validItems.length} perPage={itemsPerPage} bind:page>
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
      </div>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
