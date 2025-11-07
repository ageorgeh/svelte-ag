<script lang="ts">
  import { type CarouselAPI, type CarouselProps, type EmblaContext, setEmblaContext } from './context.js';
  import { cn } from '$utils/utils.js';
  import emblaCarouselSvelte from 'embla-carousel-svelte';

  let {
    opts = {},
    plugins = [],
    setApi = () => {},
    orientation = 'horizontal',
    class: className,
    children,
    pointerdown,
    pointerup,
    onSelect: a_onSelect,
    symbol = undefined,
    ...restProps
  }: CarouselProps = $props();

  let carouselState = $state<EmblaContext>({
    api: undefined,
    scrollPrev,
    scrollNext,
    orientation,
    canScrollNext: false,
    canScrollPrev: false,
    handleKeyDown,
    options: opts,
    plugins,
    onInit,
    scrollSnaps: [],
    selectedIndex: 0,
    scrollTo
  });

  setEmblaContext(carouselState, symbol);

  function scrollPrev() {
    carouselState.api?.scrollPrev();
  }
  function scrollNext() {
    carouselState.api?.scrollNext();
  }
  function scrollTo(index: number, jump?: boolean) {
    carouselState.api?.scrollTo(index, jump);
  }

  function onSelect(api: CarouselAPI) {
    if (!api) return;
    carouselState.canScrollPrev = api.canScrollPrev();
    carouselState.canScrollNext = api.canScrollNext();
    carouselState.selectedIndex = api.selectedScrollSnap();
    a_onSelect?.(api);
  }

  function reinit(api: CarouselAPI) {
    onSelect(api);
  }

  $effect(() => {
    if (carouselState.api) {
      onSelect(carouselState.api);
      carouselState.api.on('reInit', reinit);
      carouselState.api.on('select', onSelect);
    }
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollNext();
    }
  }

  $effect(() => {
    setApi(carouselState.api);
  });

  function onInit(event: CustomEvent<CarouselAPI>) {
    carouselState.api = event.detail;

    carouselState.scrollSnaps = carouselState.api.scrollSnapList();
    if (pointerdown) {
      carouselState.api.on('pointerDown', pointerdown);
    }
    if (pointerup) {
      carouselState.api.on('pointerUp', pointerup);
    }
  }

  $effect(() => {
    return () => {
      carouselState.api?.off('select', onSelect);
      carouselState.api?.off('reInit', reinit);
      if (pointerdown) carouselState.api?.off('pointerDown', pointerdown);
      if (pointerup) carouselState.api?.off('pointerUp', pointerup);
    };
  });
</script>

<!-- svelte-ignore event_directive_deprecated -->
<div
  class={cn('relative', className)}
  role="region"
  aria-roledescription="carousel"
  {...restProps}
  use:emblaCarouselSvelte={{
    options: {
      container: `[data-embla-container="${symbol?.description ?? 'default'}"]`,
      loop: true,
      slides: `[data-embla-slide="${symbol?.description ?? 'default'}"]`,
      ...carouselState.options,
      axis: carouselState.orientation === 'horizontal' ? 'x' : 'y'
    },
    plugins: carouselState.plugins
  }}
  on:emblaInit={carouselState.onInit}
>
  {@render children?.()}
</div>
