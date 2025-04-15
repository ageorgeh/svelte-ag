<script lang="ts" module>
</script>

<script lang="ts">
  import { cn, type HTMLDivAttributes } from '$utils';
  import type { WithElementRef } from 'svelte-toolbelt';
  import * as Popover from '$shadcn/popover/index.js';
  import { Button } from '$shadcn/button/index.js';
  import * as Command from '$shadcn/command/index.js';
  import { tick } from 'svelte';

  export type Props = WithElementRef<HTMLDivAttributes> & {
    class?: string;
    items: { label: string; value: string }[];
  };

  let { items, class: className = '', children, ...restProps }: Props = $props();

  let open = $state(false);
  let value = $state('');
  let triggerRef = $state<HTMLButtonElement>(null!);

  const selectedValue = $derived(items.find((f) => f.value === value)?.label);

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
        {selectedValue || 'Select an item...'}
        <span class="icon-[lucide--chevrons-up-down] opacity-50"></span>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-full p-0">
    <Command.Root>
      <Command.Input placeholder="Search item..." />
      <div class="p-1">
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
            {#each items as item (item.value)}
              <Command.Item
                value={item.label}
                onSelect={() => {
                  value = item.value;
                  closeAndFocusTrigger();
                }}
              >
                <span class={cn('icon-[lucide--check]', value !== item.value && 'text-transparent')}> </span>
                {item.label}
              </Command.Item>
            {/each}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
