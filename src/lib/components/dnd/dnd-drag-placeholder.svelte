<script lang="ts" module>
  export type DragPlaceholderProps = {
    class?: string;
    props: { isDragging: boolean };
  };
</script>

<script lang="ts">
  import { cn } from '$utils';

  let { class: className, props }: DragPlaceholderProps = $props();
</script>

{#if props.isDragging}
  <div
    class={cn(
      `
        border-primary bg-primary/10 absolute inset-0 hidden rounded-3xl border border-dashed
        md:block
      `,
      className
    )}
  ></div>
{/if}
