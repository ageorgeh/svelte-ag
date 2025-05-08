import type { WithElementRef } from 'bits-ui';
import type { EmblaCarouselSvelteType } from 'embla-carousel-svelte';
import type emblaCarouselSvelte from 'embla-carousel-svelte';
import { getContext, hasContext, setContext } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

export type CarouselAPI =
  NonNullable<NonNullable<EmblaCarouselSvelteType['$$_attributes']>['on:emblaInit']> extends (
    evt: CustomEvent<infer CarouselAPI>
  ) => void
    ? CarouselAPI
    : never;

type EmblaCarouselConfig = NonNullable<Parameters<typeof emblaCarouselSvelte>[1]>;

export type CarouselOptions = EmblaCarouselConfig['options'];
export type CarouselPlugins = EmblaCarouselConfig['plugins'];

////

export type CarouselProps = {
  symbol?: symbol;
  opts?: CarouselOptions;
  plugins?: CarouselPlugins;
  setApi?: (api: CarouselAPI | undefined) => void;
  pointerdown?: (api: CarouselAPI) => void;
  pointerup?: (api: CarouselAPI) => void;
  orientation?: 'horizontal' | 'vertical';
} & WithElementRef<HTMLAttributes<HTMLDivElement>>;

export type EmblaContext = {
  api: CarouselAPI | undefined;
  orientation: 'horizontal' | 'vertical';
  scrollNext: () => void;
  scrollPrev: () => void;
  canScrollNext: boolean;
  canScrollPrev: boolean;
  handleKeyDown: (e: KeyboardEvent) => void;
  options: CarouselOptions;
  plugins: CarouselPlugins;
  onInit: (e: CustomEvent<CarouselAPI>) => void;
  scrollTo: (index: number, jump?: boolean) => void;
  scrollSnaps: number[];
  selectedIndex: number;
};

const EMBLA_CAROUSEL_CONTEXT = Symbol('EMBLA_CAROUSEL_CONTEXT');

export function setEmblaContext(config: EmblaContext, symbol: symbol = EMBLA_CAROUSEL_CONTEXT): EmblaContext {
  setContext(symbol, config);
  return config;
}

export function getEmblaContext(name = 'This component', symbol: symbol = EMBLA_CAROUSEL_CONTEXT): EmblaContext {
  if (!hasContext(symbol)) {
    throw new Error(`${name} must be used within a <Carousel.Root> component`);
  }
  return getContext<ReturnType<typeof setEmblaContext>>(symbol);
}
