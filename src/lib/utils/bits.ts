export type { WithRefProps } from 'svelte-toolbelt';

export function getDataOpenClosed(condition: boolean) {
  return condition ? 'open' : 'closed';
}
export function getDataChecked(condition: boolean) {
  return condition ? 'checked' : 'unchecked';
}
export function getAriaDisabled(condition: boolean) {
  return condition ? 'true' : 'false';
}
export function getAriaReadonly(condition: boolean) {
  return condition ? 'true' : 'false';
}
export function getAriaExpanded(condition: boolean) {
  return condition ? 'true' : 'false';
}
export function getDataDisabled(condition: boolean) {
  return condition ? '' : undefined;
}
export function getAriaRequired(condition: boolean) {
  return condition ? 'true' : 'false';
}
export function getAriaSelected(condition: boolean) {
  return condition ? 'true' : 'false';
}
export function getAriaChecked(checked: boolean, indeterminate: boolean) {
  if (indeterminate) {
    return 'mixed';
  }
  return checked ? 'true' : 'false';
}
export function getAriaOrientation(orientation: boolean) {
  return orientation;
}
export function getAriaHidden(condition: boolean) {
  return condition ? 'true' : undefined;
}
export function getAriaInvalid(condition: boolean) {
  return condition ? 'true' : undefined;
}
export function getDataOrientation(orientation: boolean) {
  return orientation;
}
export function getDataInvalid(condition: boolean) {
  return condition ? '' : undefined;
}
export function getDataRequired(condition: boolean) {
  return condition ? '' : undefined;
}
export function getDataReadonly(condition: boolean) {
  return condition ? '' : undefined;
}
export function getDataSelected(condition: boolean) {
  return condition ? '' : undefined;
}
export function getDataUnavailable(condition: boolean) {
  return condition ? '' : undefined;
}
export function getHidden(condition: boolean) {
  return condition ? true : undefined;
}
export function getDisabled(condition: boolean) {
  return condition ? true : undefined;
}
export function getAriaPressed(condition: boolean) {
  return condition ? 'true' : 'false';
}
export function getRequired(condition: boolean) {
  return condition ? true : undefined;
}

import type { HTMLFormAttributes } from 'svelte/elements';
import type { HTMLAttributes } from 'svelte/elements';

type BitsPrimitive<T> = Omit<T, 'style' | 'id' | 'children'> & {
  id?: string;
};
export type BitsPrimitiveFormAttributes = BitsPrimitive<HTMLFormAttributes>;

export type HTMLDivAttributes = HTMLAttributes<HTMLDivElement>;

export interface Test {
  test: string;
}
