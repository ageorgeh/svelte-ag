<!-- 
Submission button that shows a loading symbol on submission

Icons:
    icon-loading

-->

<script module lang="ts">
  import type { FormFieldProps } from './form-field.svelte';
  import type { FormPath } from 'sveltekit-superforms';
  import type { Props as ButtonProps } from '$shadcn/button/index.js';

  // eslint-disable-next-line
  export type FormButtonProps<T extends Record<string, unknown> = {}, U extends FormPath<T> = any> = Omit<
    ButtonProps,
    'form'
  > & {
    form?: FormFieldProps<T, U>['form'];
    name?: U;
  };
</script>

<script lang="ts" generics="T extends Record<string, unknown>, U extends FormPath<T>">
  import { Button } from '$shadcn/button/index.js';
  import { cn, flyAndScale } from '$utils/utils.js';
  import { getFormContext } from './form.svelte';

  let {
    ref = $bindable(null),
    form = getFormContext<T, U>(),
    children,
    class: className,
    ...restProps
  }: FormButtonProps<T, U> = $props();

  const { submitting, delayed } = $derived(form);
</script>

<Button bind:ref type="submit" class={cn(className)} {...restProps}>
  <span class={cn('flex transition-opacity', $submitting && !$delayed && 'opacity-0')}>
    {#if $submitting && $delayed}
      <span in:flyAndScale|global class="icon-loading"></span>
    {:else}
      {@render children?.()}
    {/if}
  </span>
</Button>
