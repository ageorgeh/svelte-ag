<script lang="ts">
  import * as FormPrimitive from 'formsnap';
  import { cn } from '$utils/utils.js';
  import type { WithoutChild } from 'svelte-toolbelt';

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChild<FormPrimitive.DescriptionProps> = $props();
</script>

<FormPrimitive.Description
  bind:ref
  data-slot="form-description"
  class={cn('text-sm text-muted-foreground', className)}
  {...restProps}
/>
