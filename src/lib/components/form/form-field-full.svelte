<!--
@component FormFieldFull
Renders all elements of a form field. If a simple Input element is all you don't 
need to provide a child

```svelte
<ContactField
    class="z-5 w-full self-start"
    {form}
    name="fields.name"
    inputProps={{ type: 'text', placeholder: 'Enter your name' }}
    label="Name"
/>
```

For custom input elements like TextArea you will need to pass a child. Everything
else is the same just bind the value prop as so:

```svelte
<ContactField
    class="z-5 w-full self-start"
    {form}
    name="fields.name"
    inputProps={{ type: 'text', placeholder: 'Enter your name' }}
    label="Name"
>
    {#snippet child({ props, value })}
      <Textarea {...props} bind:value={value.get, value.set} class="z-5 w-full" />
    {/snippet}
</ContactField>

```

-->

<script module lang="ts">
  export type FormFullFieldProps<T extends Record<string, unknown>, U extends FormPath<T>> = FormFieldProps<T, U> & {
    label: string;
    description?: string;
    inputProps?: HTMLInputAttributes;
    /**
     * Pass this snippet to customise the input for the field.
     * You are responsible for binding to the value eg
     * <Textarea {...props} bind:value={value.get, value.set} class="z-5 w-full"
     */
    child?: Snippet<
      [
        Parameters<NonNullable<ComponentProps<typeof FormControl>['children']>>[0] & {
          value: { get: () => any; set: (v: any) => void };
        }
      ]
    >;
  } & WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>>;
</script>

<script lang="ts" generics="T extends Record<string, unknown>, U extends FormPath<T>">
  import FormField, { type FormFieldProps } from './form-field.svelte';
  import FormLabel from './form-label.svelte';
  import Description from './form-description.svelte';
  import FieldErrors from './form-field-errors.svelte';
  import { Input } from '$shadcn/input/index.js';
  import { Control as FormControl } from 'formsnap';
  import { type FormPath } from 'sveltekit-superforms';
  import { get, set } from 'radash';
  import { type WithElementRef, type WithoutChildren } from 'svelte-toolbelt';
  import { cn } from '$utils/index.js';
  import type { HTMLAttributes, HTMLInputAttributes } from 'svelte/elements';
  import { mergeProps } from 'svelte-toolbelt';
  import { getFormContext } from './form.svelte';
  import type { ComponentProps, Snippet } from 'svelte';
  import { Checkbox } from '$shadcn/checkbox/index.js';

  let {
    ref = $bindable(null),
    class: className,
    form = getFormContext<T, U>(),
    name,
    label,
    description = '',
    inputProps,
    child,
    ...restProps
  }: FormFullFieldProps<T, U> = $props();

  const formData = $derived(form.form);
</script>

<FormField {form} {name} class={cn(className)} {...restProps}>
  <FormControl>
    {#snippet children({ props })}
      {@const inProps = mergeProps(inputProps as any, props) as typeof props}
      <FormLabel>{label}</FormLabel>

      <!-- radash.get and radash.set because we need to dynamically index $formData -->
      {#if child}
        {@render child({
          props: inProps,
          value: { get: () => get($formData, name), set: (v) => ($formData = set($formData, name, v)) }
        })}
      {:else if inputProps?.type === 'checkbox'}
        <Checkbox
          {...inProps}
          bind:checked={() => get($formData, name), (v) => ($formData = set($formData, name, v))}
        />
      {:else}
        <Input {...inProps} bind:value={() => get($formData, name), (v) => ($formData = set($formData, name, v))} />
      {/if}
    {/snippet}
  </FormControl>

  <Description>{description}</Description>
  <FieldErrors />
</FormField>
