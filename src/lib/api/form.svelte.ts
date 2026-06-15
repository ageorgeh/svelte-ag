import { dequal } from 'dequal';
import { watch } from 'runed';
import { get } from 'svelte/store';
import { superForm, defaults, setError, setMessage } from 'sveltekit-superforms';
import type { SuperForm } from 'sveltekit-superforms';
import { valibot } from 'sveltekit-superforms/adapters';
import type {
  ApiRequestFunction,
  ApiEndpoints,
  ApiInput,
  ApiSuccessBody,
  ApiErrorBody,
  ApiEndpointContract
} from 'ts-ag';
import { safeParse, safeParseAsync } from 'valibot';

export type ValidInput<E extends ApiEndpoints, P extends E['path'], M extends E['method']> = NonNullable<
  ApiInput<E, P, M>
>;

type FormProps<T extends ApiEndpoints, P extends T['path'], M extends Extract<T, { path: P }>['method']> = NonNullable<
  Parameters<typeof superForm<ValidInput<T, P, M>>>[1]
>;

type FormOnUpdateArgs<
  T extends ApiEndpoints,
  P extends T['path'],
  M extends Extract<T, { path: P }>['method']
> = Parameters<NonNullable<FormProps<T, P, M>['onUpdate']>>[0];

type FormActionArgs<
  T extends ApiEndpoints,
  P extends T['path'],
  M extends Extract<T, { path: P }>['method'],
  B = undefined
> = FormOnUpdateArgs<T, P, M> & { body: B };

type FormErrorBody<
  T extends ApiEndpoints,
  P extends T['path'],
  M extends Extract<T, { path: P }>['method']
> = ApiErrorBody<T, P, M> & {
  message: string;
  field?: {
    name: string;
    value: string;
  };
};

/**
 * Creates a strongly-typed form factory for an API schema.
 *
 * Call the returned function with `{ endpoint, ... }` to get a `SuperForm`
 * that:
 * - Validates using the Valibot schema for the given endpoint.
 * - Submits via the provided `request` function on each valid update.
 * - Maps API errors to `sveltekit-superforms` field errors / messages.
 * - Optionally two-way binds external state through the `bind` adapter.
 */
export type ApiRequestForm<API extends ApiEndpoints> = <
  Path extends API['path'],
  Method extends Extract<API, { path: Path }>['method']
>(a: {
  /** Endpoint contract used to select a schema and submit the request. */
  endpoint: ApiEndpointContract<API, Path, Method>;

  /**
   * Optional lifecycle hooks for consumers.
   * - `beforeRequest`: called before sending the api call
   * - `onSuccess`: called after a successful response body is parsed.
   * - `onFail`: called after an error response body is parsed and mapped to form errors/messages.
   *
   * Each hook receives the `onUpdate` event object plus a `body` field.
   */
  actions?: {
    beforeRequest?: (args: FormActionArgs<API, Path, Method>) => void | Promise<void>;
    onSuccess?: (args: FormActionArgs<API, Path, Method, ApiSuccessBody<API, Path, Method>>) => void | Promise<void>;
    onFail?: (args: FormActionArgs<API, Path, Method, ApiErrorBody<API, Path, Method>>) => void | Promise<void>;
  };

  /**
   * Partial initial values merged into schema defaults via `defaults(..., valibot(schema))`.
   * Useful for edit forms where you only have a subset of fields initially.
   */
  defaultValue?: Partial<ApiInput<API, Path, Method>>;

  /**
   * Two-way binding adapter to sync this form with external state.
   *
   * Use this when your app keeps the source-of-truth somewhere else (e.g. a store/box),
   * but you still want Superforms handling validation + errors + submission.
   *
   * How it works:
   * - Form -> external: on any form change, `bind.get(formData)` is validated against the schema,
   *   and if it differs from the current form value, `bind.set(formValue)` is called.
   * - External -> form: whenever the external-derived value changes, the form store is updated
   *   to match (only if different).
   *
   * Important:
   * - `get` should return an "input shape" object using the formData arg to populate fields that the
   *   external data store doesnt determine
   * - `set` should update your external state based on the raw form data.
   * - Keep `get` deterministic and free of side-effects; it is called frequently.
   */
  bind?: {
    /**
     * Derives the schema-valid value from the current form data.
     * This is where you transform/prune the form state into the exact shape your endpoint expects.
     *
     * Return value must validate to `ValidInput<API, Path, Method>`.
     */
    get: (formData: ApiInput<API, Path, Method>) => ValidInput<API, Path, Method>;

    /**
     * Writes updated form data back to your external state.
     * Called only when the derived value differs (deep) from the current form state.
     */
    set: (formData: ApiInput<API, Path, Method>) => void;
  };

  /**
   * Extra `superForm` options (merged last).
   * If you pass `onSubmit` / `onUpdate` here it will override the defaults in this helper.
   */
  formProps?: Parameters<typeof superForm<ValidInput<API, Path, Method>>>[1];
}) => SuperForm<ValidInput<API, Path, Method>>;

/**
 * Build an endpoint-specific Superforms factory.
 *
 * @param request An API request function that performs `(endpoint, data)` and returns a fetch-like `Response`.
 *
 * @returns A function that creates a `SuperForm` for a particular endpoint contract.
 */
export function createFormFunction<API extends ApiEndpoints>(request: ApiRequestFunction<API>): ApiRequestForm<API> {
  return ({ endpoint, actions, defaultValue, formProps, bind }) => {
    const schema = endpoint.schema;

    const defaultFormData = defaults(defaultValue, valibot(schema));
    const boundFormData =
      bind && schema.async === false
        ? (safeParse(schema, bind.get(defaultFormData)).output as ValidInput<
            API,
            typeof endpoint.path,
            typeof endpoint.method
          >)
        : defaultFormData;

    const form = superForm<ValidInput<API, typeof endpoint.path, typeof endpoint.method>>(boundFormData, {
      SPA: true,
      resetForm: true,
      applyAction: false, // Prevents the form redirecting to the same page on submit
      delayMs: 300,
      validators: valibot(schema),
      async onSubmit({ submitter }) {
        // If a submit button has a name/value, include it in JSON forms (common for "intent" buttons).
        // eg. save with email vs save
        if (
          submitter &&
          'name' in submitter &&
          typeof submitter.name === 'string' &&
          'value' in submitter &&
          typeof submitter.value === 'string'
        ) {
          form.form.update((f) => {
            if ((submitter.name as any) in f) {
              f[submitter.name as any] = submitter.value;
            }
            return f;
          });
        }
      },
      async onUpdate(props) {
        if (actions && actions.beforeRequest) await actions.beforeRequest({ ...props, body: undefined });
        if (!props.form.valid) return;

        // console.log('onUpdate: sending data', form.data);
        const res = await request(endpoint, props.form.data);

        if (res.ok === false) {
          const body = (await res.json()) as FormErrorBody<API, typeof endpoint.path, typeof endpoint.method>;

          // TODO set some kind of overall form error if there is no field
          if (!body.field) {
            setMessage(props.form, body.message);
            // setError(form, '', body.message);
          } else {
            setError(props.form, body.field!.name as any, body.field.value, { status: res.status });
          }
          if (actions && actions.onFail) {
            await actions.onFail({ ...props, body });
          }
        } else {
          setMessage(props.form, 'Success');
          if (actions && actions.onSuccess) {
            const body = (await res.json()) as ApiSuccessBody<API, typeof endpoint.path, typeof endpoint.method>;
            await actions.onSuccess({ ...props, body });
          }
        }
      },
      ...formProps
    });

    if (bind !== undefined) {
      /**
       * Reads current form store, maps it through `bind.get`, and validates it against the endpoint schema.
       * Returns the parsed (schema-valid) value.
       */
      const bindGet = async () => {
        const formData = get(form.form);
        return (await safeParseAsync(schema, bind.get(formData))).output as ValidInput<
          API,
          typeof endpoint.path,
          typeof endpoint.method
        >;
      };

      form.form.subscribe((v) => {
        bindGet().then((bindValue) => {
          // console.log('Updating binded value', bindValue, 'to', v);

          if (!dequal(bindValue, v)) {
            bind.set(v);

            // bindGet().then((v) => {
            //   console.log('done update', bindGet());
            // });
          }
        });
      });

      watch(
        () => bindGet(),
        (newPromise) => {
          newPromise.then((newValue) => {
            // console.log('The state changed, updating the form from', get(form.form), 'to', newValue);

            if (!dequal(get(form.form), newValue)) {
              form.form.set(newValue);
            }
          });
        }
      );
    }

    return form;
  };
}
