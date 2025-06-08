#version 300 es

precision highp float;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_offset;

uniform vec2 u_centerPos;
uniform vec2 u_radius;
uniform float u_noise;
uniform vec4 u_centerColor;
uniform vec4 u_edgeColor;

// Pseudo-random number between 0 and 1 generator
float dither(vec2 pos) {
    return fract(sin(dot(pos, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 fragPos = gl_FragCoord.xy + u_offset;

    vec2 centerPx = u_centerPos * u_resolution;
    vec2 radiusPx = u_radius * u_resolution;

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
    float noise = (dither(gl_FragCoord.xy) - 0.5) * (u_noise / 255.0);

    fragColor = mix(u_centerColor, u_edgeColor, clamp(t + noise, 0.0, 1.0));
}
