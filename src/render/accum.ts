// Progressive accumulation while the view is still: a running average of jittered samples that
// resets the moment anything that changes the image moves.

/** Samples averaged before the image counts as converged. */
export const SAMPLE_CAP = 128;
/** Per-value tolerance before a view counts as changed (well under a hundredth of a pixel). */
const TOL = 1e-5;

/** Radical inverse of i in the given base (Halton sequence), in [0, 1). */
export function halton(i: number, base: number): number {
  let f = 1, r = 0;
  for (; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}

/** Sub-pixel offset of sample n, in pixels within [-0.5, 0.5). Sample 0 is the pixel centre. */
export function jitter(n: number): [number, number] {
  return n === 0 ? [0, 0] : [halton(n, 2) - 0.5, halton(n, 3) - 0.5];
}

export class Accumulator {
  /** Samples in the history so far. */
  n = 0;
  private anchor: number[] | null = null;

  constructor(private readonly cap = SAMPLE_CAP) {}

  /** Forget the history (new targets or sky textures). */
  reset(): void {
    this.anchor = null;
  }

  /** True when `key` matches the view the history was built for (compared with the anchor, not the
   * previous frame, so a slow drift cannot creep past the tolerance unnoticed). */
  matches(key: readonly number[]): boolean {
    const a = this.anchor;
    return !!a && a.length === key.length && key.every((v, i) => Math.abs(v - a[i]) <= TOL);
  }

  converged(key: readonly number[]): boolean {
    return this.n >= this.cap && this.matches(key);
  }

  /** Starts or continues the history for `key`; returns the index of the sample to take and its
   * blend weight (1 replaces the history, 0 keeps it as it is). */
  next(key: readonly number[]): { index: number; weight: number } {
    if (!this.matches(key)) {
      this.anchor = [...key];
      this.n = 0;
    }
    if (this.n >= this.cap) return { index: this.n, weight: 0 };
    return { index: this.n, weight: 1 / ++this.n };
  }
}
