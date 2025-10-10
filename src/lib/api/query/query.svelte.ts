import type { ApiEndpoints, ApiInput, ApiRequestFunction, ApiSuccessBody, ApiErrorBody, ApiResponse } from 'ts-ag';

import { stringify } from 'devalue';
import Bottleneck from 'bottleneck';
import type { Cache } from './cache.svelte';

import * as env from '$env/static/public';
import { sleep } from 'radash';
import { cacheKey } from './utils.svelte.js';
import type { BatchDetails } from './entrypoint.svelte';

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

export class Query<
  API extends ApiEndpoints,
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
> {
  // -------- Constants --------
  #TIMEOUT = 1000 * 60 * 5; // 5 minutes

  // -------- Set in constructor --------
  #path: Path;
  #method: Method;
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
    path,
    method,
    input,
    requestor,
    cache
  }: {
    path: Path;
    method: Method;
    input: ApiInput<API, Path, Method>;
    requestor: Requestor<API, Path, Method>;
    cache: Cache;
    opts?: {
      cache?: Parameters<Cache['register']>[1];
    };
  }) {
    this.#requestor = requestor;
    this.#cache = cache;

    this.#path = path;
    this.#method = method;

    // if (this.#cachekey) this.#cache.deregister(this.#cachekey);

    this.#input = input;
    this.#inputString = stringify(input);
    this.#cacheKey = cacheKey(path, method, input);

    this.#cache.register(this.#cacheKey, { timeout: this.#TIMEOUT });
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
    const res = await this.#pendingRequest;
    this.#pendingRequest = null;

    this.#cache.set(this.#cacheKey, res);

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
  #path: Path;
  #method: Method;
  #request: ApiRequestFunction<API>;

  #canBatch: BatchDetails<API, Path, Method>['canBatch'];
  #batchInput: BatchDetails<API, Path, Method>['batchInput'];
  #unBatchOutput: BatchDetails<API, Path, Method>['unBatchOutput'];

  #limiter: Bottleneck;
  #cache: Cache;

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

  constructor(
    path: Path,
    method: Method,
    request: ApiRequestFunction<API>,
    cache: Cache,
    batchDetails?: BatchDetails<API, Path, Method>
  ) {
    this.#path = path;
    this.#method = method;
    this.#request = request;
    this.#limiter = new Bottleneck({
      maxConcurrent: 5,
      minTime: 100
    });
    this.#cache = cache;

    // TODO
    this.#canBatch = batchDetails ? batchDetails.canBatch : () => false;
    this.#batchInput = batchDetails ? batchDetails.batchInput : (inputs) => inputs;
    this.#unBatchOutput = batchDetails ? batchDetails.unBatchOutput : (inputs, output) => [output];
  }

  // Makes the actual call to the api
  private async fetch(input: ApiInput<API, Path, Method>): Promise<ApiResponse<API, Path, Method>> {
    if ('PUBLIC_ENVIRONMENT' in env && env.PUBLIC_ENVIRONMENT === 'development') {
      await sleep(1000);
    }
    return await this.#limiter.schedule(() => this.#request(this.#path, this.#method, input));
  }

  /**
   * Empties the batch queue for the id by combining the inputs.
   * Then it separates the outputs and resolves each of the promises
   */
  private async flushBatchQueue(batchId: string): Promise<void> {
    const queue = this.#batchQueue[batchId].splice(0);

    const batchedInput = this.#batchInput(queue.map((q) => q.input));

    const res = await this.fetch(batchedInput);
    const output = await this.#unBatchOutput(
      queue.map((q) => q.input),
      res
    );

    queue.forEach(({ resolve, reject }, i) => {
      if (output[i].ok === true) {
        resolve(output[i]);
      } else {
        reject(output[i]);
      }
    });
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
            this.flushBatchQueue(batchId);
            delete this.#batchTimers[batchId];
          }, this.#batchDelay);
        }
      });
    } else {
      return await this.fetch(input);
    }
  }
}
