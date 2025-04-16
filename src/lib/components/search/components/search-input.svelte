<script lang="ts">
  import { box, mergeProps } from 'svelte-toolbelt';
  import type { SearchInputProps } from '../types';
  import { useId } from 'bits-ui';
  import { useSearchInput } from '../search.svelte';
  import { Input } from '$shadcn/input';
  import { cn } from '$utils';

  let {
    child,
    class: className,
    id = useId(),
    ref = $bindable(null),
    value = $bindable(''),
    ...restProps
  }: SearchInputProps = $props();

  const inputState = useSearchInput({
    id: box.with(() => id),
    ref: box.with(
      () => ref,
      (v) => (ref = v)
    ),
    value: box.with(
      () => value,
      (v) => (value = v)
    )
  });

  const mergedProps = $derived(mergeProps(restProps, inputState.props));
</script>

{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <div class="flex w-full items-center border-b px-2" data-command-input-wrapper="">
    <span class="icon-[lucide--search] mr-2 size-4 shrink-0 opacity-50"></span>
    <input
      {...mergedProps}
      type="text"
      placeholder="Search..."
      class={cn(
        `
          placeholder:text-muted-foreground
          flex h-11 w-full rounded-md bg-transparent py-3 text-base outline-none
          disabled:cursor-not-allowed disabled:opacity-50
          md:text-sm
        `,
        className
      )}
      bind:value
    />
  </div>
{/if}
