import { superForm, defaults, setError, setMessage, type SuperForm, type SuperValidated } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import type {
  ApiRequestFunction,
  HTTPMethod,
  ApiEndpoints,
  ApiInput,
  ApiSuccessBody,
  ApiErrorBody,
  ApiSchema
} from 'ts-ag';

type ValidInput<E extends ApiEndpoints, P extends E['path'], M extends E['method']> = NonNullable<ApiInput<E, P, M>>;

export type ApiRequestForm<API extends ApiEndpoints> = <
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
>(a: {
  path: Path;
  method: Method;
  actions?: {
    onSuccess?: (
      form: SuperValidated<ValidInput<API, Path, Method>>,
      response: ApiSuccessBody<API, Path, Method>
    ) => void | Promise<void>;
    onFail?: (
      form: SuperValidated<ValidInput<API, Path, Method>>,
      response: ApiErrorBody<API, Path, Method>
    ) => void | Promise<void>;
  };
  defaultValue?: Partial<ApiInput<API, Path, Method>>;
  formProps?: Parameters<typeof superForm<ValidInput<API, Path, Method>>>[1];
}) => SuperForm<ValidInput<API, Path, Method>>;

export function createFormFunction<API extends ApiEndpoints>(
  schemas: Partial<Record<API['path'], Partial<Record<HTTPMethod, ApiSchema>>>>,
  request: ApiRequestFunction<API>
): ApiRequestForm<API> {
  return ({ path, method, actions, defaultValue, formProps }) => {
    const schema = schemas[path]?.[method];
    if (schema === undefined) throw new Error('Invalid schema for form');

    // if (typeof schema === 'function') {
    //   schema = schema();
    // }

    return superForm<ValidInput<API, typeof path, typeof method>>(defaults(defaultValue, valibot(schema)), {
      SPA: true,
      resetForm: true,
      applyAction: false, // Prevents the form redirecting to the same page on submit
      delayMs: 300,
      validators: valibot(schema),
      async onUpdate({ form }) {
        if (!form.valid) return;

        const res = await request(path, method, form.data);

        if (res.ok === false) {
          const body = await res.json();

          // TODO set some kind of overall form error if there is no field
          if (!body.field) {
            setMessage(form, body.message);
            // setError(form, '', body.message);
          } else {
            setError(form, body.field!.name, body.field.value, { status: res.status });
          }
          if (actions && actions.onFail) {
            await actions.onFail(form, body as ApiErrorBody<API, typeof path, typeof method>);
          }
        } else {
          setMessage(form, 'Success');
          if (actions && actions.onSuccess) {
            const body = await res.json();
            await actions.onSuccess(form, body);
          }
        }
      },
      ...formProps
    });
  };
}
