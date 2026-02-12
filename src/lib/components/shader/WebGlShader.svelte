<script module lang="ts">
  export type { BuiltinValue, BuiltinParameter, NonBuiltinParameter, WebGlParameter as Parameter } from './types.js';
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  import BaseShader from './BaseShader.svelte';
  import type { BuiltinParameter, WebGlParameter as Parameter } from './types.js';
  import { isBuiltinValue } from './types.js';

  export let width: string | undefined = undefined;
  export let height: string | undefined = undefined;

  export let code: string | Promise<string>;

  export let parameters: readonly Parameter[] = [];
  const rerenderEveryFrame = parameters.some((parameter) => parameter.value === 'time');

  export let forceAnimation = false;

  const maxTextureSize = 4096;

  let requestRender: () => void;
  let canvasElement: HTMLCanvasElement;

  let canRender = typeof WebGL2RenderingContext !== 'undefined';

  type Config = {
    gl: WebGL2RenderingContext;
    shaderProgram: WebGLProgram;
  };

  const configPromise = new Promise<Config>((resolve) =>
    onMount(async () => {
      try {
        if (!canRender) return;

        if (canvasElement === null) return;
        const gl = canvasElement.getContext('webgl2');
        if (gl === null) throw new Error('Failed to get WebGL2 context.');
        const shaderProgram = gl.createProgram();
        if (shaderProgram === null) throw new Error('Failed to create WebGL shader program.');

        const loadShader = (source: string, type: number) => {
          const shader = gl.createShader(type);
          if (shader === null) throw new Error('Failed to create texture.');
          gl.shaderSource(shader, source);
          gl.compileShader(shader);

          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);

          gl.attachShader(shaderProgram, shader);
        };

        // Simple identity function
        const vertexShaderSource = `#version 300 es
          in vec4 pos;
          void main() {
              gl_Position = pos;
          }
        `;
        loadShader(vertexShaderSource, gl.VERTEX_SHADER);
        loadShader(await code, gl.FRAGMENT_SHADER);

        gl.linkProgram(shaderProgram);
        gl.useProgram(shaderProgram);

        // Create a rectangle covering the canvas
        const vertexAttributePosition = gl.getAttribLocation(shaderProgram, 'pos');
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const positions = [1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, -1.0];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.vertexAttribPointer(vertexAttributePosition, numComponents, type, normalize, stride, offset);
        gl.enableVertexAttribArray(vertexAttributePosition);

        resolve({ gl, shaderProgram });
      } catch (error) {
        console.warn(error);
        canRender = false;
      }
    })
  );

  async function render() {
    const { gl } = await configPromise;
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  async function updateCanvasSize(canvasWidth: number, canvasHeight: number) {
    const { gl } = await configPromise;
    gl.viewport(0, 0, canvasWidth, canvasHeight);
  }

  async function updateContainerSize(containerWidth: number, containerHeight: number) {
    const { gl, shaderProgram } = await configPromise;

    const resolutionParam = parameters.find(
      (parameter): parameter is BuiltinParameter => parameter.value === 'resolution'
    );
    if (resolutionParam !== undefined) {
      const uniformPosition = gl.getUniformLocation(shaderProgram, resolutionParam.name);
      gl.uniform2fv(uniformPosition, [containerWidth, containerHeight]);

      // If the resolution is not passed to the shader, rerendering cannot change the output.
      requestRender();
    }
  }

  async function updateOffset(offsetX: number, offsetY: number) {
    const { gl, shaderProgram } = await configPromise;

    const offsetParam = parameters.find((parameter): parameter is BuiltinParameter => parameter.value === 'offset');
    if (offsetParam !== undefined) {
      const uniformPosition = gl.getUniformLocation(shaderProgram, offsetParam.name);
      gl.uniform2fv(uniformPosition, [offsetX, offsetY]);

      // If the offset is not passed to the shader, rerendering cannot change the output.
      requestRender();
    }
  }

  async function updateScale(scale: number) {
    const { gl, shaderProgram } = await configPromise;

    const scaleParam = parameters.find((parameter): parameter is BuiltinParameter => parameter.value === 'scale');
    if (scaleParam !== undefined) {
      const uniformPosition = gl.getUniformLocation(shaderProgram, scaleParam.name);
      gl.uniform1f(uniformPosition, scale);

      // If the scale is not passed to the shader, rerendering cannot change the output.
      requestRender();
    }
  }

  async function updateTime(time: number) {
    const { gl, shaderProgram } = await configPromise;

    const timeParam = parameters.find((parameter): parameter is BuiltinParameter => parameter.value === 'time');
    if (timeParam !== undefined) {
      const uniformPosition = gl.getUniformLocation(shaderProgram, timeParam.name);
      gl.uniform1f(uniformPosition, time);
    }
  }

  function isBuiltinParameter(parameter: Parameter): parameter is BuiltinParameter {
    const shouldBeBuiltin = typeof parameter.value === 'string';
    if (!shouldBeBuiltin) return false;

    if (isBuiltinValue(parameter.value)) return true;

    throw new Error(`Unknown built-in value: ${parameter.value}`);
  }

  async function updateParameters(nextParameters: readonly Parameter[]) {
    const { gl, shaderProgram } = await configPromise;

    for (const parameter of nextParameters) {
      if (parameter.value === undefined) throw new Error('One or more parameters had an undefined value field.');

      if (!isBuiltinParameter(parameter)) {
        const uniformPosition = gl.getUniformLocation(shaderProgram, parameter.name);
        switch (parameter.type) {
          case 'float':
            gl.uniform1f(uniformPosition, parameter.value);
            break;
          case 'vec2':
            gl.uniform2fv(uniformPosition, parameter.value);
            break;
          case 'vec3':
            gl.uniform3fv(uniformPosition, parameter.value);
            break;
          case 'vec4':
            gl.uniform4fv(uniformPosition, parameter.value);
            break;
          case 'int':
            gl.uniform1i(uniformPosition, parameter.value);
            break;
          case 'ivec2':
            gl.uniform2iv(uniformPosition, parameter.value);
            break;
          case 'ivec3':
            gl.uniform3iv(uniformPosition, parameter.value);
            break;
          case 'ivec4':
            gl.uniform4iv(uniformPosition, parameter.value);
            break;
          case 'uint':
            gl.uniform1ui(uniformPosition, parameter.value);
            break;
          case 'uvec2':
            gl.uniform2uiv(uniformPosition, parameter.value);
            break;
          case 'uvec3':
            gl.uniform3uiv(uniformPosition, parameter.value);
            break;
          case 'uvec4':
            gl.uniform4uiv(uniformPosition, parameter.value);
            break;
          case 'mat2':
            gl.uniformMatrix2fv(uniformPosition, false, parameter.value);
            break;
          case 'mat3':
            gl.uniformMatrix3fv(uniformPosition, false, parameter.value);
            break;
          case 'mat4':
            gl.uniformMatrix4fv(uniformPosition, false, parameter.value);
            break;
          default:
            throw new Error(`Unknown parameter type: ${(parameter as { type: string }).type}`);
        }
      }
    }

    requestRender();
  }

  $: updateParameters(parameters);
</script>

<BaseShader
  {width}
  {height}
  {canRender}
  maxSize={maxTextureSize}
  offsetFromBottom
  {rerenderEveryFrame}
  {forceAnimation}
  {render}
  {updateCanvasSize}
  {updateContainerSize}
  {updateOffset}
  {updateScale}
  {updateTime}
  bind:canvasElement
  bind:requestRender
>
  <slot></slot>
</BaseShader>
