import { SvelteMap } from 'svelte/reactivity';
import type { ApiEndpoints, ApiRequestFunction, ApiInput, ApiResponse } from 'ts-ag';
import { Requestor, Query } from './query.svelte.js';
import { Cache } from './cache.svelte.js';
import { batchQueryKey, cacheKey } from './utils.svelte.js';

// ---------------- Global state ----------------
// Map of path_method to the corresponding batch query instance
const requestors = new SvelteMap<string, Requestor<any, any, any>>();
// Map of path_method_input to the corresponding query instance
const queries = new SvelteMap<string, Query<any, any, any>>();

const cache = new Cache();

// ---------------- Helpers ----------------

export type BatchDetails<
  API extends ApiEndpoints,
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
> = {
  canBatch: (input: ApiInput<API, Path, Method>) => string | false;
  batchInput: (inputs: ApiInput<API, Path, Method>[]) => ApiInput<API, Path, Method>;
  unBatchOutput: (output: ApiResponse<API, Path, Method>) => ApiResponse<API, Path, Method>[];
};

export type ApiBatchDetails<API extends ApiEndpoints> = {
  [Path in API['path']]?: {
    [Method in Extract<API, { path: Path }>['method']]?: BatchDetails<API, Path, Method>;
  };
};

/**
 * Helper function to use once so that creating queries is easier.
 *
 * @example
 * export const createQuery = createQueryFunction<YourApiEndpoints>(yourApiRequest);
 *
 */
export function createQueryFunction<API extends ApiEndpoints>(
  request: ApiRequestFunction<API>,
  batchDetails: ApiBatchDetails<API>
) {
  return <Path extends API['path'], Method extends Extract<API, { path: Path }>['method']>(
    path: Path,
    method: Method,
    input: ApiInput<API, Path, Method>,
    opts?: ConstructorParameters<typeof Query<API, Path, Method>>[0]['opts']
  ): Query<API, Path, Method> => {
    const queryKey = cacheKey(path, method, input);
    if (!queries.has(queryKey)) {
      const key = batchQueryKey(path, method);
      if (!requestors.has(key)) {
        requestors.set(key, new Requestor(path, method, request, cache, batchDetails[path]?.[method]));
      }
      const requestor = requestors.get(key)!;

      queries.set(queryKey, new Query<API, Path, Method>({ path, method, input, requestor, cache, opts }));
    }
    const query = queries.get(queryKey)!;

    return query;
  };
}
