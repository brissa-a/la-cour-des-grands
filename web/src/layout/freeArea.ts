import type { Rect } from "../preview/placement.ts"

export function freeArea(stage: Rect, overlays: readonly Rect[], clearance: number): Rect | null {
  let top = stage.top
  let bottom = stage.bottom
  for (const overlay of overlays) {
    if (overlay.top + overlay.bottom < stage.top + stage.bottom) top = Math.max(top, overlay.bottom)
    else bottom = Math.min(bottom, overlay.top)
  }
  return inset({ left: stage.left, top, right: stage.right, bottom }, clearance) ?? inset(stage, clearance)
}

function inset(rect: Rect, by: number): Rect | null {
  const inner = { left: rect.left + by, top: rect.top + by, right: rect.right - by, bottom: rect.bottom - by }
  return inner.right > inner.left && inner.bottom > inner.top ? inner : null
}
