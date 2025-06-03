import type { ApiEndpoints, ApiInput, ApiRequestFunction, ApiSuccessBody, ApiErrorBody } from 'ts-ag';

export class Query<
  API extends ApiEndpoints,
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
> {
  #path: Path;
  #method: Method;
  #request: ApiRequestFunction<API>;
  #status = $state<'idle' | 'loading' | 'success' | 'error'>('idle');
  #data = $state<ApiSuccessBody<API, Path, Method> | undefined>(undefined);
  #errorData = $state<ApiErrorBody<API, Path, Method> | undefined>(undefined);

  constructor(path: Path, method: Method, request: ApiRequestFunction<API>) {
    this.#path = path;
    this.#method = method;
    this.#request = request;
  }

  async fetch(input: ApiInput<API, Path, Method>) {
    const res = await this.#request(this.#path, this.#method, input);
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
    method: Method
  ) => {
    return new Query<API, Path, Method>(path, method, request);
  };
}
