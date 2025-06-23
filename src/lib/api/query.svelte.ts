import type { ApiEndpoints, ApiInput, ApiRequestFunction, ApiSuccessBody, ApiErrorBody, ApiResponse } from 'ts-ag';
import { dequal } from 'dequal';

import { SvelteMap } from 'svelte/reactivity';
import { stringify } from 'devalue';

export class Query<
  API extends ApiEndpoints,
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
> {
  // -------- Constants --------

  // -------- Set in constructor --------
  #path: Path;
  #method: Method;
  #input: ApiInput<API, Path, Method>;
  #request: ApiRequestFunction<API>;
  #batchQuery: BatchQuery<API, Path, Method>;

  // -------- State --------
  // Requesting state
  #pendingRequests = new SvelteMap<string, Promise<any>>();

  // Response state
  #status = $state<'idle' | 'loading' | 'success' | 'error'>('idle');
  #data = $state<ApiSuccessBody<API, Path, Method> | undefined>(undefined);
  #errorData = $state<ApiErrorBody<API, Path, Method> | undefined>(undefined);

  // -------- Functions --------
  constructor(
    path: Path,
    method: Method,
    input: ApiInput<API, Path, Method>,
    request: ApiRequestFunction<API>,
    batchQuery: BatchQuery<API, Path, Method>
  ) {
    this.#path = path;
    this.#method = method;
    this.#input = input;
    this.#request = request;
    this.#batchQuery = batchQuery;
  }

  async request() {
    const inputString = stringify(this.#input);
    if (this.#pendingRequests.has(inputString)) {
      return this.#pendingRequests.get(inputString);
    }
    const res = await this.#batchQuery.request(this.#input);

    if (res.ok === false) {
      const body = await res.json();
      this.#status = 'error';

      // @ts-expect-error Generics not working for some reason
      this.#errorData = body;
      return res;
    } else {
      const body = await res.json();
      this.#status = 'success';
      this.#data = body;
      return res;
    }
  }

  get status() {
    return this.#status;
  }
  get data() {
    return this.#data;
  }
}

export class BatchQuery<
  API extends ApiEndpoints,
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
> {
  // -------- Constants --------
  #batchDelay = 100;

  // -------- Set in constructor --------
  #path: Path;
  #method: Method;
  #request: ApiRequestFunction<API>;

  #canBatch: (input: ApiInput<API, Path, Method>) => string | false;
  #batchInput: (inputs: ApiInput<API, Path, Method>[]) => ApiInput<API, Path, Method>;
  #unBatchOutput: (output: ApiResponse<API, Path, Method>) => ApiResponse<API, Path, Method>[];

  // -------- State --------
  #batchQueue: Record<
    string,
    {
      resolve: (value: ApiResponse<API, Path, Method>) => void;
      reject: (err: ApiResponse<API, Path, Method>) => void;
      input: ApiInput<API, Path, Method>;
    }[]
  > = {};
  #batchTimers: Record<string, NodeJS.Timeout | null> = {};

  constructor(path: Path, method: Method, request: ApiRequestFunction<API>) {
    this.#path = path;
    this.#method = method;
    this.#request = request;

    // TODO
    this.#canBatch = () => false;
    this.#batchInput = (inputs) => inputs;
    this.#unBatchOutput = (output) => [output];
  }

  private async fetch(input: ApiInput<API, Path, Method>): Promise<ApiResponse<API, Path, Method>> {
    return this.#request(this.#path, this.#method, input);
  }

  private async flushBatchQueue(batchId: string) {
    const queue = this.#batchQueue[batchId];
    const batchedInput = this.#batchInput(queue.map((q) => q.input));
    const res = await this.fetch(batchedInput);
    const output = this.#unBatchOutput(res);

    queue.forEach(({ resolve, reject }, i) => {
      if (output[i].ok === true) {
        resolve(output[i]);
      } else {
        reject(output[i]);
      }
    });
  }

  async request(input: ApiInput<API, Path, Method>): Promise<ApiResponse<API, Path, Method>> {
    const batchId = this.#canBatch(input);
    if (batchId !== false) {
      return new Promise((resolve, reject) => {
        this.#batchQueue[batchId].push({ input, resolve, reject });
        if (!this.#batchTimers[batchId]) {
          this.#batchTimers[batchId] = setTimeout(() => this.flushBatchQueue(batchId), this.#batchDelay);
        }
      });
    } else {
      return this.fetch(input);
    }
  }
}

const batchQueries = new SvelteMap<string, BatchQuery<any, any, any>>();
function batchQueriesKey(path: string, method: string) {
  return `${path}_${method}`;
}

/**
 * Helper function to use once so that creating queries is easier.
 *
 * @example
 * export const createQuery = createQueryFunction<YourApiEndpoints>(yourApiRequest);
 *
 */
export function createQueryFunction<API extends ApiEndpoints>(request: ApiRequestFunction<API>) {
  return <Path extends API['path'], Method extends Extract<API, { path: Path }>['method']>(
    path: Path,
    method: Method,
    input: ApiInput<API, Path, Method>
  ) => {
    const key = batchQueriesKey(path, method);
    if (!batchQueries.has(key)) {
      batchQueries.set(key, new BatchQuery(path, method, request));
    }
    const batchQuery = batchQueries.get(key)!;

    return new Query<API, Path, Method>(path, method, input, request, batchQuery);
  };
}
