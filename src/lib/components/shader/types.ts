export type BuiltinValue = 'resolution' | 'offset' | 'scale' | 'time';

export type BuiltinParameter = {
  name: string;
  value: BuiltinValue;
};

export type NonBuiltinParameter =
  | { name: string; type: 'float' | 'int' | 'uint'; value: number }
  | { name: string; type: 'vec2' | 'ivec2' | 'uvec2'; value: readonly [number, number] }
  | { name: string; type: 'vec3' | 'ivec3' | 'uvec3'; value: readonly [number, number, number] }
  | { name: string; type: 'vec4' | 'ivec4' | 'uvec4'; value: readonly [number, number, number, number] }
  | {
      name: string;
      type: 'mat2';
      value: readonly [number, number, number, number];
    }
  | {
      name: string;
      type: 'mat3';
      value: readonly [number, number, number, number, number, number, number, number, number];
    }
  | {
      name: string;
      type: 'mat4';
      value: readonly [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number
      ];
    };

export type WebGlParameter = BuiltinParameter | NonBuiltinParameter;

export type WebGpuBuiltinParameter = {
  label: string;
  binding: number;
  value: BuiltinValue;
  storage?: boolean;
};

export type WebGpuParameter =
  | WebGpuBuiltinParameter
  | {
      label: string;
      binding: number;
      value: BufferSource;
      storage?: boolean;
    };

export function isBuiltinValue(value: unknown): value is BuiltinValue {
  return value === 'resolution' || value === 'offset' || value === 'scale' || value === 'time';
}
