const BASE_SIZE = 13;
const BASE_ZOOM = 1.44;
const LINE_RATIO = 1.3;
 
export function codeFontPx(): number {
  const zoom = window.devicePixelRatio || 1;
  const px = BASE_SIZE * Math.min(1.35, Math.max(1, BASE_ZOOM / zoom));
  return Math.round(px * 2) / 2;
}
 
export function codeLinePx(): number {
  return Math.round(codeFontPx() * LINE_RATIO);
}
 
export function applyCodeScale(): void {
  const s = document.documentElement.style;
  s.setProperty("--code-size", `${codeFontPx()}px`);
  s.setProperty("--code-lh", `${codeLinePx()}px`);
}
