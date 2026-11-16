// Applies the saved logo form before first paint (external file: the CSP forbids inline scripts).
try {
  const logo = globalThis.localStorage.getItem("logo-form");
  if (logo === "short" || logo === "middle" || logo === "long") globalThis.document.documentElement.setAttribute("data-logo", logo);
} catch {
  // Storage blocked: the default (middle) logo form applies.
}
