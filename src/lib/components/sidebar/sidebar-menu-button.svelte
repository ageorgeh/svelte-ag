<script lang="ts" module>
  import { tv, type VariantProps } from 'tailwind-variants';

  export const sidebarMenuButtonVariants = tv({
    base: cn(`
      peer/menu-button ring-sidebar-ring flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm
      transition-[width,height,padding] outline-none
      hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
      active:bg-sidebar-accent active:text-sidebar-accent-foreground
      data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground
      data-[active=true]:font-medium
      data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground
      group-has-[[data-sidebar=menu-action]]/menu-item:pr-8
      group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2
      focus-visible:ring-2
      disabled:pointer-events-none disabled:opacity-50
      aria-disabled:pointer-events-none aria-disabled:opacity-50
      [&>span:last-child]:truncate
      [&>svg]:size-4 [&>svg]:shrink-0
    `),
    variants: {
      variant: {
        default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        outline: `
          bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))]
          hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
          hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]
        `
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: `
          h-12 text-sm
          group-data-[collapsible=icon]:!p-0
        `
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  });

  export type SidebarMenuButtonVariant = VariantProps<typeof sidebarMenuButtonVariants>['variant'];
  export type SidebarMenuButtonSize = VariantProps<typeof sidebarMenuButtonVariants>['size'];
</script>

<script lang="ts">
  import { mergeProps, type WithElementRef, type WithoutChildrenOrChild } from 'bits-ui';
  import * as Tooltip from '$shadcn/tooltip/index.js';
  import * as AlertDialog from '$shadcn/alert-dialog/index.js';

  import { cn } from '$utils/utils.js';
  import type { ComponentProps, Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { useSidebar } from './context.svelte.js';

  let {
    ref = $bindable(null),
    class: className,
    children,
    child,
    variant = 'default',
    size = 'default',
    side = 'left',
    isActive = false,
    tooltipContent,
    tooltipContentProps,
    alertContent,
    alertContentProps,
    alertOpen = $bindable(false),
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
    isActive?: boolean;
    variant?: SidebarMenuButtonVariant;
    size?: SidebarMenuButtonSize;
    side?: 'left' | 'right';
    tooltipContent?: Snippet;
    tooltipContentProps?: WithoutChildrenOrChild<ComponentProps<typeof Tooltip.Content>>;
    alertContent?: Snippet;
    alertContentProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialog.Content>>;
    alertOpen?: boolean;
    child?: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();

  const sidebar = useSidebar();

  const buttonProps = $derived({
    class: cn(sidebarMenuButtonVariants({ variant, size }), className),
    'data-sidebar': 'menu-button',
    'data-size': size,
    'data-active': isActive,
    ...restProps
  });
</script>

{#snippet Button({ props }: { props?: Record<string, unknown> })}
  {@const mergedProps = mergeProps(buttonProps, props)}
  {#if child}
    {@render child({ props: mergedProps })}
  {:else}
    <button bind:this={ref} {...mergedProps}>
      {@render children?.()}
    </button>
  {/if}
{/snippet}

{#if !tooltipContent}
  {@render Button({})}
{:else if tooltipContent && !alertContent}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        {@render Button({ props })}
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content
      side="right"
      align="center"
      hidden={sidebar.state[side] !== 'collapsed' || sidebar.isMobile}
      children={tooltipContent}
      {...tooltipContentProps}
    />
  </Tooltip.Root>
  <!-- Added by me. The option to also have an alert -->
{:else if alertContent}
  <AlertDialog.Root bind:open={alertOpen}>
    <Tooltip.Provider>
      <Tooltip.Root delayDuration={0}>
        <Tooltip.Trigger>
          {#snippet child({ props: tooltipProps })}
            <AlertDialog.Trigger>
              {#snippet child({ props })}
                {@render Button({ props: mergeProps(tooltipProps, props) })}
              {/snippet}
            </AlertDialog.Trigger>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content
          side="right"
          align="center"
          hidden={sidebar.state[side] !== 'collapsed' || sidebar.isMobile}
          children={tooltipContent}
          {...tooltipContentProps}
        />
      </Tooltip.Root>
    </Tooltip.Provider>

    <AlertDialog.Content children={alertContent} {...alertContentProps} />
  </AlertDialog.Root>
{/if}
