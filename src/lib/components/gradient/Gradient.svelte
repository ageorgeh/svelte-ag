<script lang="ts">
  import { WebGlShader } from 'svader';

  let {
    center,
    edge,
    noise,
    centerPos = ['0.5', '0.5'],
    radius = ['1.0', '1.0']
  }: { center: string; edge: string; noise: string; centerPos: [string, string]; radius: [string, string] } = $props();

  const shaderCode = `#version 300 es
  
  precision highp float;
  
  out vec4 fragColor;
  
  uniform vec2 u_resolution;
  uniform vec2 u_offset;
  
  // Pseudo-random number between 0 and 1 generator
  float dither(vec2 pos) {
      return fract(sin(dot(pos, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  void main() {
      vec2 fragPos = gl_FragCoord.xy + u_offset;

      vec2 centerPx = vec2(${centerPos.join()}) * u_resolution;
      vec2 radiusPx = vec2(${radius.join()}) * u_resolution;

      // Calculate distance from the center of the canvas
      float d = distance(fragPos, u_resolution / 2.0); 

      // Calculate max distance from center to corner of the canvas
      float maxDist = length(u_resolution / 2.0); 
      // float t = d / maxDist;

      // compute “stretched” distance
      vec2 diff = fragPos - centerPx;
      vec2 norm = diff / radiusPx;
      float t = length(norm);
  
      // Dither strength (1/255 ~ 8-bit step size)
      float noise = (dither(gl_FragCoord.xy) - 0.5) * ( ${noise} / 255.0);
  
      vec4 c1 = vec4(${center}); // center 
      vec4 c2 = vec4(${edge}); // edge 
  
      fragColor = mix(c1, c2, clamp(t + noise, 0.0, 1.0));
  }
  
  `;
</script>

<WebGlShader
  width="100%"
  height="100%"
  code={shaderCode}
  parameters={[
    { name: 'u_resolution', value: 'resolution' },
    { name: 'u_offset', value: 'offset' }
  ]}
>
  <div class="fallback">WebGL not supported in this environment.</div>
</WebGlShader>
