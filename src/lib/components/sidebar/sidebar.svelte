<script lang="ts">
  import * as Sheet from '$shadcn/sheet/index.js';
  import { cn } from '$shadcn/utils.js';
  import type { WithElementRef } from 'bits-ui';
  import type { HTMLAttributes } from 'svelte/elements';
  import { SIDEBAR_WIDTH_MOBILE } from './constants.js';
  import { useSidebar } from './context.svelte.js';

  let {
    ref = $bindable(null),
    side = 'left',
    variant = 'sidebar',
    collapsible = 'offcanvas',
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    side?: 'left' | 'right';
    variant?: 'sidebar' | 'floating' | 'inset';
    collapsible?: 'offcanvas' | 'icon' | 'none';
  } = $props();

  const sidebar = useSidebar();
</script>

{#if collapsible === 'none'}
  <div
    data-variant={variant}
    class={cn(
      `
        bg-sidebar text-sidebar-foreground flex h-full w-[var(--sidebar-width)] flex-col
        data-[variant=floating]:border-sidebar-border data-[variant=floating]:rounded-lg data-[variant=floating]:border
        data-[variant=floating]:shadow
      `,
      className
    )}
    bind:this={ref}
    {...restProps}
  >
    {@render children?.()}
  </div>
{:else if sidebar.isMobile}
  <Sheet.Root bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)} {...restProps}>
    <Sheet.Content
      data-sidebar="sidebar"
      data-mobile="true"
      class="
        bg-sidebar text-sidebar-foreground w-[var(--sidebar-width)] p-0
        [&>button]:hidden
      "
      style="--sidebar-width: {SIDEBAR_WIDTH_MOBILE};"
      {side}
    >
      <div class="flex h-full w-full flex-col">
        {@render children?.()}
      </div>
    </Sheet.Content>
  </Sheet.Root>
{:else}
  <div
    bind:this={ref}
    class={cn(
      `
        text-sidebar-foreground group peer relative hidden
        md:flex
      `,
      className
    )}
    data-state={sidebar.state[side]}
    data-collapsible={sidebar.state[side] === 'collapsed' ? collapsible : ''}
    data-variant={variant}
    data-side={side}
  >
    <!-- This is what handles the sidebar gap on desktop -->
    <div
      class={cn(
        `relative w-[var(--sidebar-width)] flex-auto bg-transparent transition-[width] duration-200 ease-linear`,
        'group-data-[collapsible=offcanvas]:w-0',
        'group-data-[side=right]:rotate-180',
        variant === 'floating' || variant === 'inset'
          ? `group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]`
          : 'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]'
      )}
    ></div>
    <div
      class={cn(
        `
          absolute inset-y-0 z-10 hidden w-[var(--sidebar-width)] transition-[left,right,width] duration-200 ease-linear
          md:flex
        `,
        side === 'left'
          ? `
            left-0
            group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]
          `
          : `
            right-0
            group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]
          `,
        // Adjust the padding for floating and inset variants.
        variant === 'floating' || variant === 'inset'
          ? `
            p-2
            group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]
          `
          : `
            group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]
            group-data-[side=left]:border-r
            group-data-[side=right]:border-l
          `
      )}
      {...restProps}
    >
      <div
        data-sidebar="sidebar"
        class="
          bg-sidebar flex h-full w-full flex-col overflow-hidden
          group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:rounded-lg
          group-data-[variant=floating]:border group-data-[variant=floating]:shadow
        "
      >
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
