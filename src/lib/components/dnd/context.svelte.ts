import { getContext, setContext } from 'svelte';

export class DndState<T> {
  activeItem = $state<T | null>(null);
  activeType = $state<string | null>(null);
  activeParent = $state<{ id: string; children: T[] } | null>(null);

  constructor() {}
}

const SYMBOL_KEY = 'dnd-context';

/**
 * Instantiates a new `DndState` instance and sets it in the context.
 *
 * @param props The constructor props for the `DndState` class.
 * @returns  The `DndState` instance.
 */
export function setDnd<T>(): DndState<T> {
  return setContext(Symbol.for(SYMBOL_KEY), new DndState());
}

/**
 * Retrieves the `DndState` instance from the context. This is a class instance,
 * so you cannot destructure it.
 * @returns The `DndState` instance.
 */
export function useDnd<T>(): DndState<T> {
  return getContext(Symbol.for(SYMBOL_KEY));
}
