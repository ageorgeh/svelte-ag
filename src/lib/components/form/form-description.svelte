<script lang="ts">
  import * as FormPrimitive from 'formsnap';
  import { cn } from '$shadcn/utils.js';
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
  class={cn('text-muted-foreground text-sm', className)}
  {...restProps}
/>
