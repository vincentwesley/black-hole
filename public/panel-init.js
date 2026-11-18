// Opens the controls panel before first paint where it fits beside the render (external file: the CSP forbids inline scripts).
// It runs right after the panel so the first frame is the final layout; src/main.ts only reads the result.
{
  const panel = globalThis.document.getElementById("panel");
  let stored = null;
  try {
    stored = globalThis.localStorage.getItem("bh-panel");
  } catch {
    // Storage blocked: the size-based default applies.
  }
  panel.open = stored ? stored === "open" : globalThis.innerWidth >= 1100 && globalThis.innerHeight >= 700;
}
