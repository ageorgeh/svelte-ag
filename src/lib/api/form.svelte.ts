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
import { watch } from 'runed';
import { dequal } from 'dequal';
import { get } from 'svelte/store';
import { safeParse, safeParseAsync } from 'valibot';

export type ValidInput<E extends ApiEndpoints, P extends E['path'], M extends E['method']> = NonNullable<
  ApiInput<E, P, M>
>;

/**
 * Creates a strongly-typed form factory for an API schema.
 *
 * Call the returned function with `{ path, method, ... }` to get a `SuperForm`
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
  /** API path key used to select a schema and to call `request(path, method, data)` */
  path: Path;

  /** HTTP method used to select a schema and to call `request(path, method, data)` */
  method: Method;

  /**
   * Optional lifecycle hooks for consumers.
   * - `beforeRequest`: called before sending the api call
   * - `onSuccess`: called after a successful response body is parsed.
   * - `onFail`: called after an error response body is parsed and mapped to form errors/messages.
   */
  actions?: {
    beforeRequest?: (form: SuperValidated<ValidInput<API, Path, Method>>) => void | Promise<void>;
    onSuccess?: (
      form: SuperValidated<ValidInput<API, Path, Method>>,
      response: ApiSuccessBody<API, Path, Method>
    ) => void | Promise<void>;
    onFail?: (
      form: SuperValidated<ValidInput<API, Path, Method>>,
      response: ApiErrorBody<API, Path, Method>
    ) => void | Promise<void>;
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
 * @param schemas A `{[path]: {[method]: schema}}` mapping used to pick the Valibot schema for each endpoint.
 * @param request An API request function that performs `(path, method, data)` and returns a fetch-like `Response`.
 *
 * @returns A function that creates a `SuperForm` for a particular `{path, method}` pair.
 */
export function createFormFunction<API extends ApiEndpoints>(
  schemas: Partial<Record<API['path'], Partial<Record<HTTPMethod, ApiSchema>>>>,
  request: ApiRequestFunction<API>
): ApiRequestForm<API> {
  return ({ path, method, actions, defaultValue, formProps, bind }) => {
    const schema = schemas[path]?.[method];
    if (schema === undefined) throw new Error('Invalid schema for form');

    // if (typeof schema === 'function') {
    //   schema = schema();
    // }

    const defaultFormData = defaults(defaultValue, valibot(schema));
    const boundFormData =
      bind && schema.async === false
        ? (safeParse(schema, bind.get(defaultFormData)).output as ValidInput<API, typeof path, typeof method>)
        : defaultFormData;

    const form = superForm<ValidInput<API, typeof path, typeof method>>(boundFormData, {
      SPA: true,
      resetForm: true,
      applyAction: false, // Prevents the form redirecting to the same page on submit
      delayMs: 300,
      validators: valibot(schema),
      async onSubmit({ submitter }) {
        // If a submit button has a name/value, include it in JSON forms (common for "intent" buttons).
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
      async onUpdate({ form }) {
        if (actions && actions.beforeRequest) actions.beforeRequest(form);

        if (!form.valid) return;

        // console.log('onUpdate: sending data', form.data);
        const res = await request(path, method, form.data);

        if (res.ok === false) {
          const body = await res.json();

          // TODO set some kind of overall form error if there is no field
          if (!body.field) {
            setMessage(form, body.message);
            // setError(form, '', body.message);
          } else {
            setError(form, body.field!.name as any, body.field.value, { status: res.status });
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

    if (bind !== undefined) {
      /**
       * Reads current form store, maps it through `bind.get`, and validates it against the endpoint schema.
       * Returns the parsed (schema-valid) value.
       */
      const bindGet = async () => {
        const formData = get(form.form);
        return (await safeParseAsync(schema, bind.get(formData))).output as ValidInput<API, typeof path, typeof method>;
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
