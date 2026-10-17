// WebGL2 pipeline: geodesic scene pass into a half-float target, dual-filter bloom, ACES composite.
// Falls back to a single tone-mapped pass when float render targets are unavailable.
import vert from "./shaders/fullscreen.vert?raw";
import sceneSrc from "./shaders/scene.frag?raw";
import downSrc from "./shaders/down.frag?raw";
import upSrc from "./shaders/up.frag?raw";
import compositeSrc from "./shaders/composite.frag?raw";
import { blackbodyTable, blackbodyXYZ, T_REF } from "../physics/color";
import { temperatureTable } from "../physics/disk";
import { bakeStarFaces, placeStars, type PlacedStars, type Star } from "../sky/stars";
import type { Preset } from "./quality";

export interface SceneParams {
  camPos: [number, number, number];
  camBasis: Float32Array;
  fovY: number; // radians, vertical
  time: number;
  tempPeak: number;
  diskOuter: number;
  doppler: boolean;
  gravity: boolean;
  bloom: number; // 0..1 strength
  exposure: number;
  starGain: number;
}

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly floatTargets: boolean;
  private progs: { scene: WebGLProgram; down: WebGLProgram; up: WebGLProgram; composite: WebGLProgram };
  private uni: { scene: Uniforms; down: Uniforms; up: Uniforms; composite: Uniforms };
  private vao: WebGLVertexArrayObject;
  private sky: WebGLTexture;
  private bbTex: WebGLTexture;
  private tempTex: WebGLTexture;
  private bbRange: [number, number];
  private tempRange: [number, number];
  private scene: Target | null = null;
  private mips: Target[] = [];
  private preset: Preset;
  private skySize = 0;
  private stars: PlacedStars = placeStars([]);
  private lumFor = 0;
  private lumScale = 1;

  constructor(readonly canvas: HTMLCanvasElement, preset: Preset) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.preset = preset;
    this.floatTargets = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");
    gl.getExtension("OES_texture_float_linear");

    this.progs = {
      scene: program(gl, vert, sceneSrc),
      down: program(gl, vert, downSrc),
      up: program(gl, vert, upSrc),
      composite: program(gl, vert, compositeSrc),
    };
    this.uni = {
      scene: uniforms(gl, this.progs.scene),
      down: uniforms(gl, this.progs.down),
      up: uniforms(gl, this.progs.up),
      composite: uniforms(gl, this.progs.composite),
    };
    this.vao = gl.createVertexArray()!;

    const bb = blackbodyTable();
    this.bbRange = [Math.log(bb.tMin), Math.log(bb.tMax)];
    this.bbTex = table2D(gl, bb.data, bb.size, gl.RGBA16F, gl.RGBA);
    const tt = temperatureTable();
    this.tempRange = [tt.rMin, tt.rMax];
    this.tempTex = table2D(gl, tt.values, tt.values.length, gl.R16F, gl.RED);
    this.sky = gl.createTexture()!;
    this.uploadSky(1);
  }

  setStars(stars: Star[]): void {
    this.stars = placeStars(stars);
    this.skySize = 0;
    this.uploadSky(this.preset.skySize);
  }

  setPreset(p: Preset): void {
    this.preset = p;
    if (this.stars.length && p.skySize !== this.skySize) this.uploadSky(p.skySize);
    this.deleteTargets();
  }

  private deleteTargets(): void {
    const gl = this.gl;
    for (const t of [this.scene, ...this.mips]) if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    this.scene = null;
    this.mips = [];
  }

  private uploadSky(size: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.sky);
    bakeStarFaces(this.stars, size, (i, f) => gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.FLOAT, f));
    // Mipmaps of a half-float texture need it to be colour-renderable (the float-target extensions).
    if (this.floatTargets) gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, this.floatTargets ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.skySize = size;
  }

  private ensureTargets(w: number, h: number): void {
    if (!this.floatTargets) return;
    if (this.scene && this.scene.w === w && this.scene.h === h) return;
    const gl = this.gl;
    this.deleteTargets();
    this.scene = target(gl, w, h);
    let mw = w, mh = h;
    for (let i = 0; i < this.preset.bloomLevels; i++) {
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
      this.mips.push(target(gl, mw, mh));
      if (mw <= 2 || mh <= 2) break;
    }
  }

  render(p: SceneParams): void {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    this.ensureTargets(w, h);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    // Scene
    const direct = !this.floatTargets;
    gl.bindFramebuffer(gl.FRAMEBUFFER, direct ? null : this.scene!.fb);
    gl.viewport(0, 0, w, h);
    const s = this.progs.scene, u = this.uni.scene;
    gl.useProgram(s);
    const tanY = Math.tan(p.fovY / 2);
    gl.uniform3fv(u.uCamPos, p.camPos);
    gl.uniformMatrix3fv(u.uCamBasis, false, p.camBasis);
    gl.uniform2f(u.uTanHalfFov, tanY * (w / h), tanY);
    gl.uniform1i(u.uMaxSteps, this.preset.maxSteps);
    gl.uniform1f(u.uStepK, this.preset.stepK);
    gl.uniform1f(u.uEscape, Math.max(50, Math.hypot(...p.camPos) * 1.05));
    gl.uniform2f(u.uDisk, 3, p.diskOuter);
    gl.uniform1f(u.uTempPeak, p.tempPeak);
    if (p.tempPeak !== this.lumFor) {
      this.lumFor = p.tempPeak;
      this.lumScale = blackbodyXYZ(T_REF)[1] / blackbodyXYZ(p.tempPeak)[1];
    }
    gl.uniform1f(u.uLumScale, this.lumScale);
    gl.uniform1f(u.uDoppler, p.doppler ? 1 : 0);
    gl.uniform1f(u.uGravity, p.gravity ? 1 : 0);
    gl.uniform1f(u.uTime, p.time);
    gl.uniform1f(u.uStarGain, p.starGain);
    gl.uniform1f(u.uDiskGain, 1);
    gl.uniform1f(u.uDirect, direct ? 1 : 0);
    gl.uniform1f(u.uExposure, p.exposure);
    gl.uniform2f(u.uBBRange, ...this.bbRange);
    gl.uniform2f(u.uTempRange, ...this.tempRange);
    bindTex(gl, 0, gl.TEXTURE_CUBE_MAP, this.sky, u.uSky);
    bindTex(gl, 1, gl.TEXTURE_2D, this.bbTex, u.uBlackbody);
    bindTex(gl, 2, gl.TEXTURE_2D, this.tempTex, u.uTempTable);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (direct) return;

    // Bloom: down the chain, then tent-upsample back up with additive blending.
    const useBloom = this.mips.length > 0 && p.bloom > 0;
    if (useBloom) {
      gl.useProgram(this.progs.down);
      let src = this.scene!;
      this.mips.forEach((m, i) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb);
        gl.viewport(0, 0, m.w, m.h);
        gl.uniform2f(this.uni.down.uTexel, 1 / src.w, 1 / src.h);
        gl.uniform1f(this.uni.down.uFirst, i === 0 ? 1 : 0);
        bindTex(gl, 0, gl.TEXTURE_2D, src.tex, this.uni.down.uSrc);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = m;
      });
      gl.useProgram(this.progs.up);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.mips.length - 1; i > 0; i--) {
        const from = this.mips[i], to = this.mips[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
        gl.viewport(0, 0, to.w, to.h);
        gl.uniform2f(this.uni.up.uTexel, 1 / from.w, 1 / from.h);
        gl.uniform1f(this.uni.up.uRadius, 1);
        bindTex(gl, 0, gl.TEXTURE_2D, from.tex, this.uni.up.uSrc);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const c = this.uni.composite;
    gl.useProgram(this.progs.composite);
    bindTex(gl, 0, gl.TEXTURE_2D, this.scene!.tex, c.uScene);
    bindTex(gl, 1, gl.TEXTURE_2D, useBloom ? this.mips[0].tex : this.scene!.tex, c.uBloom);
    gl.uniform1f(c.uHasBloom, useBloom ? 1 : 0);
    // Each upsample level adds energy, so normalise by the number of levels summed.
    gl.uniform1f(c.uBloomStrength, Math.min(1, (p.bloom * 0.35) / Math.max(1, this.mips.length * 0.5)));
    gl.uniform1f(c.uExposure, p.exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Renders one frame and reads it back immediately (tests and the snapshot button). */
  readPixels(p: SceneParams): Uint8Array {
    this.render(p);
    const gl = this.gl;
    const out = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }

  info(): { renderer: string; floatTargets: boolean } {
    const gl = this.gl;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return { renderer: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)), floatTargets: this.floatTargets };
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
  return p;
}

function uniforms(gl: WebGL2RenderingContext, p: WebGLProgram): Uniforms {
  const out: Uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i)!.name;
    out[name] = gl.getUniformLocation(p, name);
  }
  return new Proxy(out, { get: (o, k: string) => o[k] ?? null });
}

function bindTex(gl: WebGL2RenderingContext, unit: number, kind: number, tex: WebGLTexture, loc: WebGLUniformLocation | null): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(kind, tex);
  gl.uniform1i(loc, unit);
}

function table2D(gl: WebGL2RenderingContext, data: Float32Array, width: number, internal: number, format: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, 1, 0, format, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function target(gl: WebGL2RenderingContext, w: number, h: number): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { fb, tex, w, h };
}
