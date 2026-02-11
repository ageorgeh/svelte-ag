<script module lang="ts">
  const formContextSymbolKey = 'super-form-context';
  export type FormContext<T extends Record<string, unknown>, U> = SuperForm<T, U>;

  export function setFormContext<T extends Record<string, unknown>, U>(form: FormContext<T, U>) {
    setContext(Symbol.for(formContextSymbolKey), form);
  }

  export function getFormContext<T extends Record<string, unknown>, U>(): FormContext<T, U> {
    return getContext(Symbol.for(formContextSymbolKey));
  }

  export type FormRootProps = WithElementRef<HTMLFormAttributes> & { form: SuperForm<any> };
</script>

<script lang="ts">
  import type { WithElementRef } from 'bits-ui';
  import { getContext, setContext } from 'svelte';
  import { cn } from 'svelte-ag';
  import type { HTMLFormAttributes } from 'svelte/elements';
  import type { SuperForm } from 'sveltekit-superforms';

  let { class: className, ref = $bindable(null), children, form, ...restProps }: FormRootProps = $props();

  // svelte-ignore state_referenced_locally
  const { enhance } = form;

  // svelte-ignore state_referenced_locally
  setFormContext(form);
</script>

<form use:enhance bind:this={ref} class={cn(className)} {...restProps}>
  {@render children?.()}
</form>
