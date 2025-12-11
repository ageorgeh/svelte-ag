<script module lang="ts">
  import type { Optional } from 'ts-ag';
  export type FormFieldProps<T extends Record<string, unknown>, U extends FormPath<T>> = Optional<
    FormPrimitive.FieldProps<T, U>,
    'form'
  > &
    WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>>;
</script>

<script lang="ts" generics="T extends Record<string, unknown>, U extends FormPath<T>">
  import * as FormPrimitive from 'formsnap';
  import type { FormPath } from 'sveltekit-superforms';
  import { type WithElementRef, type WithoutChildren } from 'svelte-toolbelt';
  import { cn } from '$utils/index.js';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getFormContext } from './form.svelte';

  let {
    ref = $bindable(null),
    class: className,
    form = getFormContext<T, U>(),
    name,
    children: childrenProp,
    ...restProps
  }: FormFieldProps<T, U> = $props();
</script>

<FormPrimitive.Field {form} {name}>
  {#snippet children({ constraints, errors, tainted, value })}
    <div bind:this={ref} data-slot="form-item" class={cn('space-y-2', className)} {...restProps}>
      {@render childrenProp?.({ constraints, errors, tainted, value: value as T[U] })}
    </div>
  {/snippet}
</FormPrimitive.Field>
