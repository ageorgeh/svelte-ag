<script module lang="ts">
  import * as Button from '$shadcn/button/index.js';
  export type FormButtonProps = Button.Props;
</script>

<script lang="ts">
  import { cn, flyAndScale } from '$utils/utils.js';
  import { getFormContext } from './form.svelte';

  let { ref = $bindable(null), children, class: className, ...restProps }: FormButtonProps = $props();

  const form = getFormContext();
  const { submitting, delayed } = form;
</script>

<Button.Root bind:ref type="submit" class={cn(className)} {...restProps}>
  <span class={cn('flex transition-opacity', $submitting && !$delayed && 'opacity-0')}>
    {#if $submitting && $delayed}
      <span in:flyAndScale|global class="icon-loading"></span>
    {:else}
      {@render children?.()}
    {/if}
  </span>
</Button.Root>
