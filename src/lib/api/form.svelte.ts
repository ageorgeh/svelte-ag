import { superForm, defaults, setError, setMessage } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import type { ApiRequestFunction, HTTPMethod, ApiEndpoints } from 'ts-ag';
import type * as v from 'valibot';

export type ApiRequestForm<API extends ApiEndpoints> = <
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
>(
  path: Path,
  method: Method
) => ReturnType<typeof superForm>;

export function createFormFunction<API extends ApiEndpoints>(
  schemas: Record<API['path'], Record<HTTPMethod, v.GenericSchema>>,
  request: ApiRequestFunction<API>
) {
  return <Path extends API['path'], Method extends Extract<API, { path: Path }>['method']>(
    path: Path,
    method: Method
  ) => {
    const schema = schemas[path]?.[method];
    if (schema === undefined) throw new Error('Invalid schema for form');

    // if (typeof schema === 'function') {
    //   schema = schema();
    // }

    return superForm(defaults(valibot(schema)), {
      SPA: true,
      resetForm: false,
      validators: valibot(schema),
      async onUpdate({ form }) {
        if (!form.valid) return;
        const res = await request(path, method, form.data);

        if (res.ok === false) {
          const body = await res.json();

          setError(form, body.field.name, body.field.value, { status: res.status });
        } else {
          setMessage(form, 'Success');
        }
      }
    });
  };
}
