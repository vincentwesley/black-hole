#version 300 es
// Per-pixel null geodesics around a Schwarzschild hole (r_s = 1). Mirrors traceRay() in
// src/physics/schwarzschild.ts: leapfrog on x'' = -1.5 h^2 x / r^5, steps proportional to r.
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec3 uCamPos;
uniform mat3 uCamBasis;      // columns: right, up, forward
uniform vec2 uTanHalfFov;
uniform int uMaxSteps;
uniform float uStepK;
uniform float uEscape;
uniform vec2 uDisk;          // inner, outer radius
uniform float uTempPeak;     // K
uniform float uLumScale;     // 1 / luminance of a blackbody at uTempPeak (relative to the table)
uniform float uDoppler;      // 0 or 1
uniform float uGravity;      // 0 or 1
uniform float uTime;
uniform float uStarGain;
uniform float uDiskGain;
uniform samplerCube uSky;
uniform sampler2D uBlackbody; // x: log T in [tMin, tMax]; rgb unit-luminance colour, a = ln Y
uniform vec2 uBBRange;        // ln tMin, ln tMax
uniform sampler2D uTempTable; // x: r in [rMin, rMax]; r = T / T_max (Novikov-Thorne)
uniform vec2 uTempRange;
uniform float uDirect;        // 1 when there is no float target: tone-map here instead of in composite
uniform float uExposure;

const int HARD_MAX = 1024;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// Disk gas texture: noise in (ln r, φ) advected at the Keplerian rate. Two phases crossfade so the
// differential rotation never winds the pattern into aliasing.
float diskDensity(float r, float phi) {
  float omega = sqrt(0.5 / (r * r * r));
  float lr = log(r);
  float d = 0.0;
  for (int k = 0; k < 2; k++) {
    float period = 40.0;
    float t = uTime / period + float(k) * 0.5;
    float ph = fract(t);
    float w = 1.0 - abs(ph * 2.0 - 1.0);
    float a = phi - omega * (ph * period) * 6.0 + float(k) * 1.7;
    // Wrap-safe angular coordinate: sample on a circle so φ = ±π joins seamlessly.
    vec2 c = vec2(cos(a), sin(a));
    float n = vnoise(vec2(lr * 18.0, 0.0) + c * 3.0 + float(k) * 11.0) * 0.6
            + vnoise(vec2(lr * 45.0, 7.0) + c * 9.0) * 0.4;
    d += w * n;
  }
  return d;
}

vec3 aces(vec3 c) { return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

vec3 blackbody(float T) {
  float x = (log(max(T, 1.0)) - uBBRange.x) / (uBBRange.y - uBBRange.x);
  if (x <= 0.0) return vec3(0.0);
  vec4 bb = texture(uBlackbody, vec2(clamp(x, 0.0, 1.0), 0.5));
  return bb.rgb * exp(bb.a);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dir = normalize(uCamBasis * vec3(ndc * uTanHalfFov, 1.0));

  vec3 x = uCamPos;
  float r0 = length(x);
  vec3 rhat = x / r0;
  float nr = dot(dir, rhat);
  vec3 tang = dir - rhat * nr;
  float kk = sqrt(1.0 - 1.0 / r0);
  vec3 v = normalize(tang + rhat * nr * kk);
  float b = r0 * length(tang) / kk;
  vec3 hv = cross(x, v);
  float hl = length(hv);
  float h2 = hl * hl;
  float lambda = hl > 1e-6 ? -b * hv.y / hl : 0.0;
  float gObs = uGravity > 0.5 ? 1.0 / kk : 1.0;

  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool captured = false;
  float r = r0;
  vec3 a = -1.5 * h2 * x / (r * r * r * r * r);

  for (int i = 0; i < HARD_MAX; i++) {
    if (i >= uMaxSteps) break;
    if (r < 1.0) { captured = true; break; }
    if (r > uEscape && dot(x, v) > 0.0) break;
    float dt = uStepK * max(r - 0.5, 0.1) / length(v);
    vec3 vh = v + a * (0.5 * dt);
    vec3 xn = x + vh * dt;
    float rn = length(xn);
    a = -1.5 * h2 * xn / (rn * rn * rn * rn * rn);
    v = vh + a * (0.5 * dt);
    if (x.y * xn.y < 0.0) {
      vec3 p = mix(x, xn, x.y / (x.y - xn.y));
      float rc = length(p);
      if (rc > uDisk.x && rc < uDisk.y) {
        float tn = texture(uTempTable, vec2((rc - uTempRange.x) / (uTempRange.y - uTempRange.x), 0.5)).r;
        float om = sqrt(0.5 / (rc * rc * rc));
        float g = (uGravity > 0.5 ? sqrt(1.0 - 1.5 / rc) * gObs : 1.0) / (uDoppler > 0.5 ? 1.0 - om * lambda : 1.0);
        float dens = diskDensity(rc, atan(p.z, p.x));
        float edge = smoothstep(uDisk.x, uDisk.x * 1.08, rc) * (1.0 - smoothstep(uDisk.y * 0.75, uDisk.y, rc));
        float alpha = clamp((0.7 + dens * 0.6) * edge, 0.0, 1.0);
        // Observed specific intensity of a blackbody seen with ratio g is a blackbody at g·T
        // (I_ν / ν³ is invariant), so beaming and colour shift both come from one lookup.
        vec3 em = blackbody(uTempPeak * tn * g) * uLumScale * uDiskGain * (0.55 + dens * 0.9);
        col += trans * alpha * em;
        trans *= 1.0 - alpha;
        if (trans < 0.01) break;
      }
    }
    x = xn;
    r = rn;
  }

  if (!captured && r > 1.5 && trans > 0.01) {
    col += trans * texture(uSky, normalize(v)).rgb * uStarGain;
  }
  if (uDirect > 0.5) col = toSrgb(aces(col * uExposure));
  outColor = vec4(col, 1.0);
}
