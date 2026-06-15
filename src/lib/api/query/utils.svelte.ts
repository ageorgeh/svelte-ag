import { stringify } from 'devalue';
import { endpointKey } from 'ts-ag';

export function batchQueryKey(endpoint: { path: string; method: string }) {
  return endpointKey(endpoint);
}

export function cacheKey(endpoint: { path: string; method: string }, input: any) {
  return `${endpointKey(endpoint)} ${stringify(input)}`;
}
