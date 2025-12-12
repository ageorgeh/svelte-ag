<script lang="ts">
  import { cn } from '$shadcn/utils.js';
  import { mergeProps, type WithChild, type WithoutChildren } from 'svelte-toolbelt';
  import { flyAndScale, type HTMLDivAttributes } from '$utils/index.js';
  import { getFormContext } from './form.svelte';

  let {
    ref = $bindable(null),
    child,
    class: className,
    ...restProps
  }: WithoutChildren<WithChild<WithoutChildren<HTMLDivAttributes>, { message: string }>> = $props();

  const form = getFormContext();

  let message = $state<string>('');
  form.message.subscribe((v) => (message = v as string));

  const mergedProps = $derived(mergeProps(restProps, {}));
</script>

{#if child}
  {@render child({
    props: mergedProps,
    message
  })}
{:else if message}
  <div transition:flyAndScale class={cn('', className)} {...mergedProps}>
    {message}
  </div>
{/if}
