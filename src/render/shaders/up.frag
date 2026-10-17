#version 300 es
// 3x3 tent upsample, blended additively onto the next larger mip (Jimenez 2014).
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
vec3 s(vec2 o) { return texture(uSrc, vUv + o * uTexel * uRadius).rgb; }
void main() {
  vec3 c = s(vec2(0)) * 4.0
    + (s(vec2(-1, 0)) + s(vec2(1, 0)) + s(vec2(0, -1)) + s(vec2(0, 1))) * 2.0
    + s(vec2(-1, -1)) + s(vec2(1, -1)) + s(vec2(-1, 1)) + s(vec2(1, 1));
  outColor = vec4(c / 16.0, 1.0);
}
