<script module lang="ts">
  export type {
    BuiltinValue,
    WebGpuBuiltinParameter as BuiltinParameter,
    WebGpuParameter as Parameter
  } from './types.js';

  type GpuNavigator = Navigator & {
    gpu?: {
      requestAdapter: () => Promise<{ requestDevice: () => Promise<any> } | null>;
      getPreferredCanvasFormat: () => string;
    };
  };

  const gpuNavigator = typeof navigator !== 'undefined' ? (navigator as GpuNavigator) : undefined;
  let canRenderGlobal = typeof gpuNavigator?.gpu !== 'undefined';

  type GlobalConfig = {
    device: any;
    vertexBuffer: any;
    vertexBufferLayout: any;
  };

  const globalConfigPromise: Promise<GlobalConfig | null> = globalInit();
  async function globalInit(): Promise<GlobalConfig | null> {
    try {
      if (!canRenderGlobal || !gpuNavigator?.gpu) return null;
      const adapter = await gpuNavigator.gpu.requestAdapter();
      if (!adapter) throw new Error('Failed to get WebGPU adapter.');

      const device = await adapter.requestDevice();
      const gpuBufferUsage = (globalThis as { GPUBufferUsage?: Record<string, number> }).GPUBufferUsage;
      if (!gpuBufferUsage) throw new Error('GPUBufferUsage is not available.');

      const vertices = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
      const vertexBuffer = device.createBuffer({
        label: 'ScreenQuad Vertex Buffer',
        size: vertices.byteLength,
        usage: gpuBufferUsage.VERTEX | gpuBufferUsage.COPY_DST
      });
      device.queue.writeBuffer(vertexBuffer, 0, vertices);

      const vertexBufferLayout = {
        arrayStride: 8,
        attributes: [
          {
            format: 'float32x2',
            offset: 0,
            shaderLocation: 0
          }
        ]
      };

      return {
        device,
        vertexBuffer,
        vertexBufferLayout
      };
    } catch (error) {
      console.warn(error);
      canRenderGlobal = false;
      return null;
    }
  }

  // Prevent recompiling identical fragment shaders across mounts.
  const cachedPipelines = new SvelteMap<string, any>();
</script>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  import BaseShader from './BaseShader.svelte';
  import { zip } from './utils.js';
  import type { WebGpuParameter as Parameter, WebGpuBuiltinParameter as BuiltinParameter } from './types.js';
  import { isBuiltinValue } from './types.js';
  import { SvelteMap } from 'svelte/reactivity';

  type Props = {
    width?: string;
    height?: string;
    code: string | Promise<string>;
    parameters?: readonly Parameter[];
    forceAnimation?: boolean;
    children?: Snippet;
  };

  let {
    width = undefined,
    height = undefined,
    code,
    parameters = [],
    forceAnimation = false,
    children
  }: Props = $props();

  const rerenderEveryFrame = $derived(parameters.some((parameter) => parameter.value === 'time'));

  const maxTextureSize = 4096;

  let requestRender = $state<() => void>(() => {});
  let canvasElement = $state<HTMLCanvasElement | null>(null);

  let canRender = $state(canRenderGlobal);

  type Config = {
    device: any;
    context: any;
    pipeline: any;
    vertexBuffer: any;
    parameterBuffers: any[];
    bindGroup: any;
  };

  const configPromise = new Promise<Config>((resolve) =>
    onMount(async () => {
      try {
        const globalConfig = await globalConfigPromise;
        if (globalConfig === null) return;
        const { device, vertexBuffer, vertexBufferLayout } = globalConfig;

        if (canvasElement === null) return;
        const context = canvasElement.getContext('webgpu') as any;
        if (!context) throw new Error('Failed to get WebGPU context.');

        const gpuNavigator = navigator as Navigator & {
          gpu?: {
            getPreferredCanvasFormat: () => string;
          };
        };
        if (!gpuNavigator.gpu) throw new Error('WebGPU navigator API is unavailable.');

        const canvasFormat = gpuNavigator.gpu.getPreferredCanvasFormat();
        context.configure({
          device,
          format: canvasFormat,
          alphaMode: 'premultiplied'
        });

        const parameterBuffers: any[] = parameters.map((parameter) => {
          if (parameter.value === undefined) throw new Error('One or more parameters had an undefined value field.');

          let byteLength: number;
          if (isBuiltinParameter(parameter)) {
            switch (parameter.value) {
              case 'resolution':
              case 'offset':
                byteLength = new Float32Array(2).byteLength;
                break;
              case 'scale':
              case 'time':
                byteLength = new Float32Array(1).byteLength;
                break;
              default:
                throw new Error('Unknown built-in value.');
            }
          } else {
            byteLength = parameter.value.byteLength;
          }

          return createParameterBuffer(device, parameter, byteLength);
        });

        let pipeline: any;
        const fragmentCode = await code;
        const cachedPipeline = cachedPipelines.get(fragmentCode);
        if (cachedPipeline !== undefined) {
          pipeline = cachedPipeline;
        } else {
          const vertexShaderModule = device.createShaderModule({
            label: 'Vertex Shader',
            // No-op vertex shader
            code: `
              @vertex
              fn vertexMain(
                  @location(0) pos: vec2f,
              ) -> @builtin(position) vec4<f32> {
                  return vec4<f32>(pos, 0.0, 1.0);
              }
            `
          });
          const fragmentShaderModule = device.createShaderModule({
            label: 'Fragment Shader',
            code: await code
          });
          pipeline = device.createRenderPipeline({
            label: 'Pipeline',
            layout: 'auto',
            vertex: {
              module: vertexShaderModule,
              entryPoint: 'vertexMain',
              buffers: [vertexBufferLayout]
            },
            fragment: {
              module: fragmentShaderModule,
              entryPoint: 'main',
              targets: [{ format: canvasFormat }]
            }
          });
          cachedPipelines.set(fragmentCode, pipeline);
        }

        const bindGroup = createBindGroup(device, pipeline, parameterBuffers);

        resolve({
          device,
          context,
          pipeline,
          vertexBuffer,
          parameterBuffers,
          bindGroup
        });
      } catch (error) {
        console.warn(error);
        canRender = false;
      }
    })
  );

  async function render() {
    const { device, context, pipeline, vertexBuffer, bindGroup } = await configPromise;

    const encoder = device.createCommandEncoder();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });
    renderPass.setPipeline(pipeline);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6);
    renderPass.end();
    device.queue.submit([encoder.finish()]);
  }

  async function updateContainerSize(containerWidth: number, containerHeight: number) {
    const { device, parameterBuffers } = await configPromise;

    const resolutionBuffer = parameterBuffers.find((_, i) => parameters[i].value === 'resolution');
    if (resolutionBuffer !== undefined) {
      const resolutionArray = new Float32Array([containerWidth, containerHeight]);
      device.queue.writeBuffer(resolutionBuffer, 0, resolutionArray);

      // If the resolution is not passed to the shader, rerendering cannot change the output.
      requestRender();
    }
  }

  async function updateOffset(offsetX: number, offsetY: number) {
    const { device, parameterBuffers } = await configPromise;

    const offsetBuffer = parameterBuffers.find((_, i) => parameters[i].value === 'offset');
    if (offsetBuffer !== undefined) {
      const offsetArray = new Float32Array([offsetX, offsetY]);
      device.queue.writeBuffer(offsetBuffer, 0, offsetArray);

      // If the offset is not passed to the shader, rerendering cannot change the output.
      requestRender();
    }
  }

  async function updateScale(scale: number) {
    const { device, parameterBuffers } = await configPromise;

    const scaleBuffer = parameterBuffers.find((_, i) => parameters[i].value === 'scale');
    if (scaleBuffer !== undefined) {
      const scaleArray = new Float32Array([scale]);
      device.queue.writeBuffer(scaleBuffer, 0, scaleArray);

      // If the scale is not passed to the shader, rerendering cannot change the output.
      requestRender();
    }
  }

  async function updateTime(time: number) {
    const { device, parameterBuffers } = await configPromise;

    const timeBuffer = parameterBuffers.find((_, i) => parameters[i].value === 'time');
    if (timeBuffer !== undefined) {
      const timeArray = new Float32Array([time]);
      device.queue.writeBuffer(timeBuffer, 0, timeArray);
    }
  }

  function isBuiltinParameter(parameter: Parameter): parameter is BuiltinParameter {
    const shouldBeBuiltin = typeof parameter.value === 'string';
    if (!shouldBeBuiltin) return false;

    if (isBuiltinValue(parameter.value)) return true;

    throw new Error(`Unknown built-in value: ${parameter.value}`);
  }

  async function updateParameters(nextParameters: readonly Parameter[]) {
    const config = await configPromise;
    const { device, pipeline, parameterBuffers } = config;

    let shouldUpdateBindGroup = false;
    nextParameters.forEach((parameter, i) => {
      if (isBuiltinParameter(parameter)) return;

      const isStorage = parameter.storage ?? false;
      const storageBufferSizeChanged = isStorage && parameter.value.byteLength !== parameterBuffers[i].size;
      if (storageBufferSizeChanged) {
        parameterBuffers[i].destroy();
        parameterBuffers[i] = createParameterBuffer(device, parameter, parameter.value.byteLength);
        shouldUpdateBindGroup = true;
      }

      device.queue.writeBuffer(parameterBuffers[i], 0, parameter.value);
    });

    if (shouldUpdateBindGroup) {
      config.bindGroup = createBindGroup(device, pipeline, parameterBuffers);
    }

    requestRender();
  }

  $effect(() => {
    updateParameters(parameters);
  });

  function createParameterBuffer(device: any, parameter: Parameter, byteLength: number) {
    const gpuBufferUsage = (globalThis as { GPUBufferUsage?: Record<string, number> }).GPUBufferUsage;
    if (!gpuBufferUsage) throw new Error('GPUBufferUsage is not available.');

    return device.createBuffer({
      label: `${parameter.label} Parameter`,
      size: byteLength,
      usage: gpuBufferUsage.COPY_DST | ((parameter.storage ?? false) ? gpuBufferUsage.STORAGE : gpuBufferUsage.UNIFORM)
    });
  }

  function createBindGroup(device: any, pipeline: any, parameterBuffers: any[]) {
    return device.createBindGroup({
      label: 'Shader Bind Group',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        ...zip(parameters, parameterBuffers).map(([parameter, buffer]) => ({
          binding: parameter.binding,
          resource: { buffer }
        }))
      ]
    });
  }

  onDestroy(async () => {
    const { context, parameterBuffers } = await configPromise;
    context.unconfigure();
    parameterBuffers.forEach((buffer) => buffer.destroy());
  });
</script>

<BaseShader
  {width}
  {height}
  {canRender}
  maxSize={maxTextureSize}
  {rerenderEveryFrame}
  {forceAnimation}
  {render}
  {updateContainerSize}
  {updateOffset}
  {updateScale}
  {updateTime}
  bind:canvasElement
  bind:requestRender
>
  {@render children?.()}
</BaseShader>
