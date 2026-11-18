#version 300 es
// One overlay label: the viewport is the label's box, the atlas row holds its text (straight alpha).
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uAtlas;
uniform vec3 uRow; // atlas u extent of the text, v of the row top and bottom
void main() { outColor = texture(uAtlas, vec2(vUv.x * uRow.x, mix(uRow.z, uRow.y, vUv.y))); }
