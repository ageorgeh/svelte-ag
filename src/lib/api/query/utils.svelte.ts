import { stringify } from 'devalue';

export function batchQueryKey(path: string, method: string) {
  return `${path}_${method}`;
}

export function cacheKey(path: string, method: string, input: any) {
  return `${path}_${method}_${stringify(input)}`;
}
