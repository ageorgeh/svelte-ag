<script module lang="ts">
  import type { ControlAttrs, ControlProps } from 'formsnap';
  export type FormControlProps = ControlProps;
</script>

<script lang="ts">
  import { Control } from 'formsnap';
  import type { Snippet } from 'svelte';
  import type { Expand } from 'svelte-toolbelt';

  import { getFormContext, type FormContext } from './form.svelte';

  let {
    children: childrenProp,
    ...restProps
  }: Omit<FormControlProps, 'children'> & {
    children?: Snippet<
      [
        {
          props: Expand<ControlAttrs>;
          formData: FormContext<any, any>['form'];
        }
      ]
    >;
  } = $props();

  const formData = getFormContext().form;
</script>

<Control {...restProps}>
  {#snippet children({ props })}
    {@render childrenProp?.({ props, formData })}
  {/snippet}
</Control>
