<script lang="ts">
  // import {Dnd} from 'svelte-ag/components/dnd/index.js';
  import { Dnd } from './index.js';

  const defaultItems = $state([
    {
      id: 'development-tasks',
      data: { title: 'Development Tasks', description: 'Technical implementation tasks' },
      children: [
        { id: 'setup-project', title: 'Setup Project', description: 'Initialize repository and configure tools' },
        { id: 'create-components', title: 'Create Components', description: 'Build reusable UI components' }
      ]
    },
    {
      id: 'design-tasks',
      data: { title: 'Design Tasks', description: 'UI/UX design related tasks' },
      children: [
        { id: 'color-palette', title: 'Color Palette', description: 'Define brand colors and variants' },
        { id: 'typography', title: 'Typography', description: 'Select and implement fonts' }
      ]
    }
  ]);
</script>

{#snippet nestedItem(item, props: Dnd.SortableItemChildProps)}
  <div
    class={`
      bg-card flex items-center justify-between rounded-2xl p-3
      ${props.isDragging ? 'opacity-0' : ''}
      ${props.isOver ? `bg-primary/5` : ''}
    `}
  >
    <div>
      <p class="text-lg font-bold">{item.title}</p>
      <p class="text-muted-foreground text-sm">{item.description}</p>
    </div>

    <Dnd.DragHandle />
  </div>
{/snippet}

{#snippet container(item, props: Dnd.SortableItemChildProps)}
  <div
    class={`
      bg-card rounded-3xl p-5 pt-6
      ${props.isDragging ? 'invisible' : ''}
    `}
  >
    <div class="text-muted-foreground flex items-center justify-between">
      <div class="pl-[1.375rem]">
        <p class="relative flex items-start text-lg font-bold">
          <span class="bg-primary absolute -left-5 h-2.5 w-2.5 rounded-full"></span>
          {item.data.title}
        </p>
        <p class="text-sm font-medium">{item.data.description}</p>
      </div>

      <Dnd.DragHandle />
    </div>

    <div class="mt-3 grid gap-2">
      <Dnd.Sortable items={item.children.map((c) => c.id)}>
        {#each item.children as nested (nested.id)}
          <Dnd.SortableItem type="item" item={nested} parent={item}>
            {#snippet child(props)}
              <!-- Original element - becomes invisible during drag but maintains dimensions -->
              {@render nestedItem(nested, props)}

              <Dnd.DragPlaceholder {props} />
            {/snippet}
          </Dnd.SortableItem>
        {/each}
      </Dnd.Sortable>
    </div>
  </div>
{/snippet}

<div class="flex flex-col gap-4 border-2 p-10">
  <Dnd.Context
    onDragEnd={(p) => {
      Dnd.sortableProps.onDragEnd(p);
      // Reorder your data
    }}
    onDragOver={(p) => Dnd.sortableProps.onDragOver(p)}
  >
    <Dnd.Sortable items={defaultItems.map((i) => i.id)}>
      <div
        class="
          grid gap-3
          md:grid-cols-2
        "
      >
        {#each defaultItems as item (item.id)}
          <Dnd.SortableItem type="container" {item} parent={{ id: 'root', children: defaultItems }}>
            {#snippet child(props)}
              {@render container(item, props)}

              <Dnd.DragPlaceholder {props} />
            {/snippet}
          </Dnd.SortableItem>
        {/each}
      </div>
    </Dnd.Sortable>

    <Dnd.DragOverLay>
      {#snippet child(type, item, props)}
        {#if type === 'container'}
          {@render container(item, props)}
        {:else}
          {@render nestedItem(item, props)}
        {/if}
      {/snippet}
    </Dnd.DragOverLay>
  </Dnd.Context>
</div>
