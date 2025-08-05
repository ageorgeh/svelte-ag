<script lang="ts" generics="T extends Record<string, unknown>, U extends FormPath<T>">
  import Field from './form-field.svelte';
  import Label from './form-label.svelte';
  import Description from './form-description.svelte';
  import FieldErrors from './form-field-errors.svelte';
  import { Input } from '$shadcn/input/index.js';
  import * as Form from 'formsnap';
  import type { FormPath } from 'sveltekit-superforms';
  import { type WithElementRef, type WithoutChildren } from 'svelte-toolbelt';
  import { cn } from '$utils/index.js';
  import type { HTMLAttributes, HTMLInputAttributes } from 'svelte/elements';
  import { mergeProps } from 'svelte-toolbelt';

  let {
    ref = $bindable(null),
    class: className,
    form,
    name,
    label,
    description = '',
    inputProps,
    ...restProps
  }: Form.FieldProps<T, U> & { label: string; description?: string; inputProps: HTMLInputAttributes } & WithoutChildren<
      WithElementRef<HTMLAttributes<HTMLDivElement>>
    > = $props();

  const { form: formData } = form;
</script>

<Field {form} {name} class={cn(className)} {...restProps}>
  <Form.Control>
    {#snippet children({ props })}
      {@const inProps = mergeProps({ ...inputProps, ...props }) as typeof props}
      <Label>{label}</Label>
      <Input {...inProps} bind:value={$formData[name]} />
    {/snippet}
  </Form.Control>

  <Description>{description}</Description>
  <FieldErrors />
</Field>
