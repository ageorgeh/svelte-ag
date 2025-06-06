<script module lang="ts">
  const formContextSymbolKey = 'super-form-context';
  export type FormContext = SuperForm<any>;

  export function setFormContext(form: FormContext) {
    setContext(Symbol.for(formContextSymbolKey), form);
  }

  export function getFormContext(): FormContext {
    return getContext(Symbol.for(formContextSymbolKey));
  }
</script>

<script lang="ts">
  import type { WithElementRef } from 'bits-ui';
  import { getContext, setContext } from 'svelte';
  import { cn } from 'svelte-ag';
  import type { HTMLFormAttributes } from 'svelte/elements';
  import type { SuperForm } from 'sveltekit-superforms';

  let {
    class: className,
    ref = $bindable(null),
    children,
    form,
    ...restProps
  }: WithElementRef<HTMLFormAttributes> & { form: SuperForm<any> } = $props();

  const { enhance } = form;

  setFormContext(form);
</script>

<form use:enhance bind:this={ref} class={cn(className)} {...restProps}>
  {@render children?.()}
</form>
