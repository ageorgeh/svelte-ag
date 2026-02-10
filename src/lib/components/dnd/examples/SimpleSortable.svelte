<script lang="ts">
  import { cn } from '$utils';
  import SimpleSortable from '../recipies/SimpleSortable.svelte';

  let items = $state([
    { id: 'task-1', content: 'Learn Svelte' },
    { id: 'task-2', content: 'Build a Kanban board' },
    { id: 'task-3', content: 'Review code' },
    { id: 'task-4', content: 'Setup project' }
  ]);
</script>

<button onclick={() => console.log($state.snapshot(items))}>hello</button>
<SimpleSortable class="bg-sidebar flex h-100 flex-col gap-4 rounded-2xl p-6" bind:items>
  {#snippet item(p)}
    <div
      class={cn(
        'bg-secondary text-secondary-foreground rounded-md border-2 p-2',
        p.isOverlay && 'shadow-2xl',
        p.isDragging && 'bg-amber-700 opacity-20'
      )}
    >
      <h4>{p.item.id}</h4>
      <p>
        {p.item.content}
      </p>
    </div>
  {/snippet}
</SimpleSortable>
