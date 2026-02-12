<script lang="ts">
  import { WebGlShader } from '$components/shader/index.js';
  import type { Vec2, Vec4 } from '$utils/glsl.js';
  import fragment from './gradient.frag?raw';
  import { cn } from '$utils';
  import type { BitsPrimitiveDivAttributes } from 'bits-ui';

  let {
    class: className,
    center,
    edge,
    noise,
    centerPos = [0.5, 0.5],
    radius = [1.0, 1.0]
  }: BitsPrimitiveDivAttributes & {
    center: Vec4;
    edge: Vec4;
    noise: number;
    centerPos?: Vec2;
    radius?: Vec2;
  } = $props();

  function toRgba(color: Vec4): string {
    const [r, g, b, a] = color.map((c) => Math.round(c * 255));
    return `rgba(${r}, ${g}, ${b}, ${color[3].toFixed(3)})`;
  }

  let fallbackBackground = $derived.by(() => {
    // Convert Vec4 colors to rgba() CSS strings
    const centerColorRgba = toRgba(center);
    const edgeColorRgba = toRgba(edge);

    const posX = centerPos[0] * 100;
    const posY = centerPos[1] * 100;

    const sizeX = radius[0] * 100;
    const sizeY = radius[1] * 100;

    return `radial-gradient(ellipse ${sizeX}% ${sizeY}% at ${posX}% ${posY}%, ${centerColorRgba}, ${edgeColorRgba})`;
  });
</script>

<div class={cn('h-full w-full', className)}>
  <WebGlShader
    width="100%"
    height="100%"
    code={fragment}
    parameters={[
      { name: 'u_resolution', value: 'resolution' },
      { name: 'u_offset', value: 'offset' },
      { name: 'u_centerPos', type: 'vec2', value: centerPos },
      { name: 'u_radius', type: 'vec2', value: radius },
      { name: 'u_noise', type: 'float', value: noise },
      { name: 'u_centerColor', type: 'vec4', value: center },
      { name: 'u_edgeColor', type: 'vec4', value: edge }
    ]}
  >
    <div style="background: {fallbackBackground};" class="fallback size-full"></div>
  </WebGlShader>
</div>
