import css from "./ui.css?inline";

let injected = false;

/** Inject the Lumen editor UI stylesheet once per document (SSR-safe). */
export function ensureEditorCss(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  if (document.querySelector("style[data-lumenedit-ui]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-lumenedit-ui", "");
  style.textContent = css;
  document.head.appendChild(style);
}
