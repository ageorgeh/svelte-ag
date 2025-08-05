import { superForm, defaults, setError, setMessage, type SuperForm, type SuperValidated } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import type { ApiRequestFunction, HTTPMethod, ApiEndpoints, ApiInput, ApiSuccessBody, ApiErrorBody } from 'ts-ag';
import type * as v from 'valibot';

type ValidInput<E extends ApiEndpoints, P extends E['path'], M extends E['method']> = NonNullable<ApiInput<E, P, M>>;

export type ApiRequestForm<API extends ApiEndpoints> = <
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
>(
  path: Path,
  method: Method,
  actions: {
    onSuccess?: (
      form: SuperValidated<ValidInput<API, Path, Method>>,
      response: ApiSuccessBody<API, Path, Method>
    ) => void;
    onFail?: (form: SuperValidated<ValidInput<API, Path, Method>>, response: ApiErrorBody<API, Path, Method>) => void;
  }
) => SuperForm<ValidInput<API, Path, Method>>;

export function createFormFunction<API extends ApiEndpoints>(
  schemas: Record<API['path'], Record<HTTPMethod, v.GenericSchema>>,
  request: ApiRequestFunction<API>
): ApiRequestForm<API> {
  return (path, method, actions) => {
    const schema = schemas[path]?.[method];
    if (schema === undefined) throw new Error('Invalid schema for form');

    // if (typeof schema === 'function') {
    //   schema = schema();
    // }

    return superForm<ValidInput<API, typeof path, typeof method>>(defaults(valibot(schema)), {
      SPA: true,
      resetForm: true,
      delayMs: 300,
      validators: valibot(schema),
      async onUpdate({ form }) {
        if (!form.valid) return;

        const res = await request(path, method, form.data);

        if (res.ok === false) {
          const body = await res.json();

          if (!body.field) {
            setError(form, '', body.message);
          } else {
            setError(form, body.field!.name, body.field.value, { status: res.status });
          }
          if (actions && actions.onFail) {
            actions.onFail(form, body as ApiErrorBody<API, typeof path, typeof method>);
          }
        } else {
          setMessage(form, 'Success');
          if (actions && actions.onSuccess) {
            const body = await res.json();
            actions.onSuccess(form, body);
          }
        }
      }
    });
  };
}
