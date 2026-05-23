import { stringify } from 'devalue';
import type {
  ApiEndpointContract,
  ApiEndpoints,
  ApiInput,
  ApiRequestFunction,
  ApiSuccessBody,
  ApiErrorBody,
  ApiResponse
} from 'ts-ag';

import type { Cache } from './cache.svelte';
import type { BatchDetails } from './entrypoint.svelte';
import { RateLimiter } from './rate.svelte';
import { cacheKey } from './utils.svelte.js';

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

export class Query<
  API extends ApiEndpoints,
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
> {
  // -------- Constants --------
  #TIMEOUT = 1000 * 60 * 5; // 5 minutes

  // -------- Set in constructor --------
  #endpoint: ApiEndpointContract<API, Path, Method>;
  #input: ApiInput<API, Path, Method>;
  #inputString: string;
  #cacheKey: string;

  #requestor: Requestor<API, Path, Method>;
  #cache: Cache;

  // -------- State --------
  // Requesting state
  #pendingRequest: Promise<ApiResponse<API, Path, Method>> | null = null;

  // Response state
  #status = $state<QueryStatus>('idle');
  #data = $state<ApiSuccessBody<API, Path, Method> | null>(null);
  #errorData = $state<ApiErrorBody<API, Path, Method> | null>(null);

  // -------- Functions --------
  constructor({
    endpoint,
    input,
    requestor,
    cache,
    opts
  }: {
    endpoint: ApiEndpointContract<API, Path, Method>;
    input: ApiInput<API, Path, Method>;
    requestor: Requestor<API, Path, Method>;
    cache: Cache;
    opts?: {
      cache?: Parameters<Cache['register']>[1];
    };
  }) {
    this.#requestor = requestor;
    this.#cache = cache;

    this.#endpoint = endpoint;

    // if (this.#cachekey) this.#cache.deregister(this.#cachekey);

    this.#input = input;
    this.#inputString = stringify(input);
    this.#cacheKey = cacheKey(endpoint, input);

    this.#cache.register(this.#cacheKey, opts?.cache ?? { timeout: this.#TIMEOUT });
  }

  async request(): Promise<ApiResponse<API, Path, Method>> {
    const cachedValue = this.#cache.get(this.#cacheKey);
    if (cachedValue !== null) {
      return cachedValue;
    }

    this.#status = 'loading';

    if (this.#pendingRequest === null) {
      this.#pendingRequest = this.#requestor.request(this.#input);
    }

    let res: ApiResponse<API, Path, Method>;
    try {
      res = await this.#pendingRequest;
    } catch (err) {
      this.#status = 'error';
      throw err;
    } finally {
      this.#pendingRequest = null;
    }

    const responseForState = res;
    const responseForCaller = res;
    this.#cache.set(this.#cacheKey, res);

    if (responseForState.ok === false) {
      const body = await responseForState.json();
      this.#status = 'error';

      // @ts-expect-error Generics not working for some reason
      this.#errorData = body;
      return responseForCaller;
    } else {
      const body = await responseForState.json();
      this.#status = 'success';
      this.#data = body;
      return responseForCaller;
    }
  }

  get cacheKey() {
    return this.#cacheKey;
  }
  get isCached() {
    return this.#cache.has(this.#cacheKey);
  }
  resetCache() {
    if (this.isCached) {
      this.#cache.reset(this.#cacheKey);
    }
  }

  get status() {
    return this.#status;
  }
  get data(): ApiSuccessBody<API, Path, Method> | null {
    return this.#data;
  }
  get errorData(): ApiErrorBody<API, Path, Method> | null {
    return this.#errorData;
  }
}

export class Requestor<
  API extends ApiEndpoints,
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
> {
  // -------- Constants --------
  #batchDelay = 100;

  // -------- Set in constructor --------
  #endpoint: ApiEndpointContract<API, Path, Method>;
  #request: ApiRequestFunction<API>;

  #canBatch: BatchDetails<API, Path, Method>['canBatch'];
  #batchInput: BatchDetails<API, Path, Method>['batchInput'];
  #unBatchOutput: BatchDetails<API, Path, Method>['unBatchOutput'];

  #limiter: RateLimiter;
  // #cache: Cache;

  // -------- State --------
  #batchQueue: Record<
    string,
    {
      resolve: (value: ApiResponse<API, Path, Method>) => void;
      reject: (err: unknown) => void;
      input: ApiInput<API, Path, Method>;
    }[]
  > = {};
  #batchTimers: Record<string, NodeJS.Timeout | null> = {};

  constructor(
    endpoint: ApiEndpointContract<API, Path, Method>,
    request: ApiRequestFunction<API>,
    _cache: Cache,
    batchDetails?: BatchDetails<API, Path, Method>
  ) {
    this.#endpoint = endpoint;
    this.#request = request;
    this.#limiter = new RateLimiter();
    // this.#cache = cache;

    // TODO
    this.#canBatch = batchDetails ? batchDetails.canBatch : () => false;
    this.#batchInput = batchDetails ? batchDetails.batchInput : (inputs) => inputs;
    this.#unBatchOutput = batchDetails ? batchDetails.unBatchOutput : (_inputs, output) => [output];
  }

  // Makes the actual call to the api
  private async fetch(input: ApiInput<API, Path, Method>): Promise<ApiResponse<API, Path, Method>> {
    // if ('PUBLIC_ENVIRONMENT' in env && env.PUBLIC_ENVIRONMENT === 'development') {
    //   await sleep(1000);
    // }
    return await this.#limiter.add(() => this.#request(this.#endpoint, input));
  }

  /**
   * Empties the batch queue for the id by combining the inputs.
   * Then it separates the outputs and resolves each of the promises
   */
  private async flushBatchQueue(batchId: string): Promise<void> {
    const queue = this.#batchQueue[batchId].splice(0);

    // TODO maybe remove the unBatchOutput function and just always return the
    // same response and then its on each consumer of each query to find the relevant records
    try {
      const batchedInput = this.#batchInput(queue.map((q) => q.input));

      const res = await this.fetch(batchedInput);
      const output = await this.#unBatchOutput(
        queue.map((q) => q.input),
        res
      );

      if (output.length !== queue.length) {
        throw new Error(`Batch output length mismatch for ${batchId}`);
      }

      queue.forEach(({ resolve }, i) => {
        resolve(output[i]!);
      });
    } catch (err) {
      queue.forEach(({ reject }) => {
        reject(err);
      });
    }
  }

  // Performs a request for a given input. Batches it if possible
  async request(input: ApiInput<API, Path, Method>): Promise<ApiResponse<API, Path, Method>> {
    const batchId = this.#canBatch(input);
    if (batchId !== false) {
      return new Promise((resolve, reject) => {
        if (!this.#batchQueue[batchId]) this.#batchQueue[batchId] = [];
        this.#batchQueue[batchId].push({ input, resolve, reject });

        if (!this.#batchTimers[batchId]) {
          this.#batchTimers[batchId] = setTimeout(() => {
            void this.flushBatchQueue(batchId).finally(() => {
              delete this.#batchTimers[batchId];
            });
          }, this.#batchDelay);
        }
      });
    } else {
      return await this.fetch(input);
    }
  }
}
