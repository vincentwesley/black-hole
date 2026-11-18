#version 300 es
// Per-pixel null geodesics around a Schwarzschild hole (r_s = 1). Mirrors traceRay() in
// src/physics/schwarzschild.ts: leapfrog on x'' = -1.5 h^2 x / r^5, steps proportional to r.
precision highp float;

in vec2 vUv;
layout(location = 0) out vec4 outColor; // HDR scene (or the tone-mapped canvas when uDirect)
layout(location = 1) out vec4 outHist;  // running average of jittered samples (src/render/accum.ts)

uniform vec3 uCamPos;
uniform mat3 uCamBasis;      // columns: right, up, forward
uniform vec2 uTanHalfFov;
uniform vec2 uShift;         // principal-point offset in NDC: keeps the hole centred in the area the UI leaves free
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
uniform samplerCube uSky;      // BSC5 stars
uniform sampler2D uMilkyWay;   // NASA SVS galactic equirect (sRGB texture, read as linear)
uniform mat3 uWorldToGal;
uniform float uMwGain;         // texture value -> star units (MILKY_WAY_SCALE), 0 when off
uniform sampler2D uBlackbody; // x: log T in [tMin, tMax]; rgb unit-luminance colour, a = ln Y
uniform vec2 uBBRange;        // ln tMin, ln tMax
uniform sampler2D uTempTable; // x: r in [rMin, rMax]; r = T / T_max (Novikov-Thorne)
uniform vec2 uTempRange;
uniform float uDirect;        // 1 when there is no float target: tone-map here instead of in composite
uniform float uExposure;
uniform sampler2D uHist;      // previous history, read at this pixel
uniform float uWeight;        // blend weight of this sample: 1 restarts the history, 0 keeps it
uniform float uFull;          // 1: history holds the whole scene (time frozen); 0: only the sky layer
uniform vec2 uJitterNdc;      // sub-pixel ray offset (full mode)
uniform vec2 uSkyJitter;      // sub-pixel sky-lookup offset in pixels (sky mode; the ray stays put)
uniform float uOverlay;       // 1: mark the shadow edge, photon sphere and ISCO (alpha channel / direct blend)
uniform float uBCrit;         // critical impact parameter 3√3 M in r_s

const int HARD_MAX = 1024;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// Educational overlay: anti-aliased line where a smoothly varying quantity v crosses R.
float lineAt(float v, float R) {
  float w = fwidth(v);
  return v > 0.0 && w < 0.3 * R ? 1.0 - smoothstep(0.5, 1.5, abs(v - R) / max(w, 1e-6)) : 0.0;
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
  vec2 ndc = vUv * 2.0 - 1.0 - uShift + uJitterNdc;
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
  bool gone = false; // left through the escape radius
  float c1 = 0.0, c2 = 0.0, t2 = 0.0; // radii of the first two disk-plane crossings (overlay), trans at the second
  float r = r0;
  vec3 a = -1.5 * h2 * x / (r * r * r * r * r);

  for (int i = 0; i < HARD_MAX; i++) {
    if (i >= uMaxSteps) break;
    if (r < 1.0) break;
    if (r > uEscape && dot(x, v) > 0.0) { gone = true; break; }
    float dt = uStepK * max(r - 0.5, 0.1) / length(v);
    vec3 vh = v + a * (0.5 * dt);
    vec3 xn = x + vh * dt;
    float rn = length(xn);
    a = -1.5 * h2 * xn / (rn * rn * rn * rn * rn);
    v = vh + a * (0.5 * dt);
    if (x.y * xn.y < 0.0) {
      vec3 p = mix(x, xn, x.y / (x.y - xn.y));
      float rc = length(p);
      if (c1 == 0.0) c1 = rc;
      else if (c2 == 0.0) { c2 = rc; t2 = trans; }
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

  // Sky lookups use explicit gradients taken here, in uniform control flow (implicit derivatives
  // inside the branch below would be undefined). Gradients are dropped where a neighbour in the 2x2
  // quad did not escape (its v is meaningless), so the shadow edge doesn't pick a blurry mip. The u
  // derivative is wrapped for the l = ±180° seam and scaled by cos b so the poles stay sharp.
  // The equirect mapping mirrors galacticToUv() in src/sky/stars.ts.
  // A ray that runs out of steps is still circling the photon sphere: its true fate is decided
  // within ~1 % of the critical impact parameter, where the sky is squeezed to a sliver, so it
  // is drawn dark like a captured one (it used to sample the sky along its last tangent).
  bool escaped = gone && trans > 0.01;
  float esc = escaped ? 1.0 : 0.0;
  float keepX = dFdx(esc) == 0.0 ? 1.0 : 0.0, keepY = dFdy(esc) == 0.0 ? 1.0 : 0.0;
  vec3 sd = normalize(v);
  vec3 sdx = dFdx(sd) * keepX, sdy = dFdy(sd) * keepY;
  vec3 g = uWorldToGal * sd;
  float bLat = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(0.5 - atan(g.y, g.x) / 6.2831853, 0.5 - bLat / 3.1415927);
  vec2 uvx = dFdx(uv) * keepX, uvy = dFdy(uv) * keepY;
  uvx.x = (uvx.x - round(uvx.x)) * cos(bLat);
  uvy.x = (uvy.x - round(uvy.x)) * cos(bLat);
  // Sky mode jitters only the sky lookup, by extrapolating along the screen gradients, so the
  // animated disk from this same ray stays exactly where it is.
  vec3 sky = vec3(0.0);
  if (escaped) {
    vec3 sdj = sd + uSkyJitter.x * sdx + uSkyJitter.y * sdy;
    vec2 uvj = uv + uSkyJitter.x * uvx + uSkyJitter.y * uvy;
    sky = (textureGrad(uSky, sdj, sdx, sdy).rgb + textureGrad(uMilkyWay, uvj, uvx, uvy).rgb * uMwGain) * uStarGain;
  }

  // Overlay, encoded as kind + coverage (1 shadow edge, 2 photon sphere, 3 ISCO; 0 none). The
  // shadow edge is where the view direction makes the critical angle with the hole,
  // sin α = b_crit sqrt(1 - r_s/r) / r (exact for a static observer); the photon sphere (its
  // equator) and the ISCO are circles in the disk plane, drawn where this ray crosses it, so they
  // are lensed exactly like the disk (both images; the second dimmed by the disk in front).
  float ov = 0.0;
  if (uOverlay > 0.5) {
    float alpha = acos(clamp(-dot(dir, rhat), -1.0, 1.0));
    float ls = lineAt(alpha, asin(min(uBCrit * kk / r0, 1.0)));
    float lp = max(lineAt(c1, 1.5), lineAt(c2, 1.5) * t2);
    float li = max(lineAt(c1, 3.0), lineAt(c2, 3.0) * t2);
    float m = max(ls, max(lp, li));
    if (m > 0.004) ov = (m == li ? 3.0 : m == lp ? 2.0 : 1.0) + min(m, 0.99);
  }

  if (uDirect > 0.5) {
    vec3 c = toSrgb(aces((col + trans * sky) * uExposure)) + (hash(gl_FragCoord.xy) - 0.5) / 255.0; // same dither as composite.frag
    if (ov > 0.0) c = mix(c, ov > 3.0 ? vec3(0.31, 0.878, 0.627) : ov > 2.0 ? vec3(0.914, 0.627, 0.498) : vec3(0.663, 0.588, 0.878), 0.85 * fract(ov));
    outColor = vec4(c, 1.0);
    return;
  }
  vec3 cur = uFull > 0.5 ? col + trans * sky : sky;
  vec3 h = uWeight >= 1.0 ? cur : mix(texelFetch(uHist, ivec2(gl_FragCoord.xy), 0).rgb, cur, uWeight);
  outHist = vec4(h, 1.0);
  outColor = vec4(uFull > 0.5 ? h : col + trans * h, ov);
}
