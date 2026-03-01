<script lang="ts" module>
  export type SvelteBreakpointBadgeProps = { dev: boolean };
</script>

<script lang="ts">
  const { dev = true }: SvelteBreakpointBadgeProps = $props();

  const breakpoints = [
    {
      name: 'default',
      bgClass: 'bg-red-100',
      borderClass: 'border-red-300',
      textClass: 'text-red-600',
      hideClass: 'sm:hidden'
    },
    {
      name: 'sm',
      bgClass: 'bg-blue-100',
      borderClass: 'border-blue-300',
      textClass: 'text-blue-600',
      hideClass: 'hidden sm:block md:hidden'
    },
    {
      name: 'md',
      bgClass: 'bg-purple-100',
      borderClass: 'border-purple-300',
      textClass: 'text-purple-600',
      hideClass: 'hidden md:block lg:hidden'
    },
    {
      name: 'lg',
      bgClass: 'bg-green-100',
      borderClass: 'border-green-300',
      textClass: 'text-green-800',
      hideClass: 'hidden lg:block xl:hidden'
    },
    {
      name: 'xl',
      bgClass: 'bg-orange-100',
      borderClass: 'border-orange-300',
      textClass: 'text-orange-600',
      hideClass: 'hidden xl:block 2xl:hidden'
    },
    {
      name: '2xl',
      bgClass: 'bg-yellow-100',
      borderClass: 'border-yellow-300',
      textClass: 'text-yellow-600',
      hideClass: 'hidden 2xl:block 3xl:hidden'
    },
    {
      name: '3xl',
      bgClass: 'bg-blue-100',
      borderClass: 'border-blue-300',
      textClass: 'text-blue-600',
      hideClass: 'hidden 3xl:block 4xl:hidden'
    },
    {
      name: '4xl',
      bgClass: 'bg-red-100',
      borderClass: 'border-red-300',
      textClass: 'text-red-600',
      hideClass: 'hidden 4xl:block 5xl:hidden'
    }
  ];
</script>

{#if dev}
  <div class="w-fit" data-testid="breakpoint-badge">
    {#each breakpoints as bp (bp.name)}
      <div
        class="
          rounded-md border px-2 text-xs font-bold
          {bp.bgClass}
          {bp.hideClass}
          {bp.borderClass}
          {bp.textClass}"
      >
        {bp.name}
      </div>
    {/each}
  </div>
{/if}
