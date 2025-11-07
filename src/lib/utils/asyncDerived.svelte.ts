import { type Readable, derived } from 'svelte/store';

/**
 * Creates a derived store whose value is transformed asynchronously.
 *
 * @template T The type of the source store(s)
 * @template R The type of the result
 * @param stores The source store(s)
 * @param callback An async function that transforms the source values
 * @param initial_value Initial value to use until the first async resolution
 * @returns A readable store with the transformed value
 */
export function asyncDerived<T, R>(
  stores: Readable<T> | Array<Readable<unknown>>,
  callback: (values: T) => Promise<R>,
  initial_value: R
): Readable<R> {
  let guard: object | undefined;

  return derived(
    stores,
    ($stores, set) => {
      // Create a unique object for this execution
      const inner = (guard = {});

      // Set the initial value immediately
      set(initial_value);

      // Run the async callback and update the value if this execution is still valid
      Promise.resolve(callback($stores)).then((value) => {
        if (guard === inner) {
          set(value);
        }
      });
    },
    initial_value
  );
}
