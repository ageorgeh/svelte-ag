<script lang="ts">
  import { WebGlShader } from 'svader';
  import type { Vec2, Vec4 } from '$utils/glsl.js';
  import fragment from './gradient.frag';

  let {
    center,
    edge,
    noise,
    centerPos = [0.5, 0.5],
    radius = [1.0, 1.0]
  }: {
    center: Vec4;
    edge: Vec4;
    noise: number;
    centerPos?: Vec2;
    radius?: Vec2;
  } = $props();
</script>

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
  <div class="fallback">WebGL not supported in this environment.</div>
</WebGlShader>
