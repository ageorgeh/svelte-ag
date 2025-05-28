import { getContext, setContext } from 'svelte';

export type DndState<T> = {
  activeItem: T | null;
  activeType: string | null;
  activeParent: { id: string; children: T[] } | null;
};

const SYMBOL_KEY = 'dnd-context';

/**
 * Instantiates a new `DndState` instance and sets it in the context.
 *
 * @param props The constructor props for the `DndState` class.
 * @returns  The `DndState` instance.
 */
export function setDnd<T>(): DndState<T> {
  const dnd = {
    activeItem: null,
    activeType: null,
    activeParent: null
  };
  return setContext(Symbol.for(SYMBOL_KEY), dnd);
}

/**
 * Retrieves the `DndState` instance from the context. This is a class instance,
 * so you cannot destructure it.
 * @returns The `DndState` instance.
 */
export function useDnd<T>(): DndState<T> {
  return getContext(Symbol.for(SYMBOL_KEY));
}
