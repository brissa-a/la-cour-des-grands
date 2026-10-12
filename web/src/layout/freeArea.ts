import type { Rect } from "../preview/placement.ts"

export type Clearance = { readonly x: number; readonly y: number }

export function freeArea(stage: Rect, overlays: readonly Rect[], clearance: Clearance): Rect | null {
  let top = stage.top
  let bottom = stage.bottom
  for (const overlay of overlays) {
    if (overlay.right <= stage.left || overlay.left >= stage.right) continue
    if (overlay.top + overlay.bottom < stage.top + stage.bottom) top = Math.max(top, overlay.bottom)
    else bottom = Math.min(bottom, overlay.top)
  }
  return inset({ left: stage.left, top, right: stage.right, bottom }, clearance) ?? inset(stage, clearance)
}

export function bleedBelow(area: Rect, covers: readonly Rect[]): number {
  let bottom = area.bottom
  for (const cover of covers) if (cover.right > area.left && cover.left < area.right && cover.top >= area.bottom) bottom = Math.max(bottom, cover.bottom)
  return bottom - area.bottom
}

function inset(rect: Rect, { x, y }: Clearance): Rect | null {
  const inner = { left: rect.left + x, top: rect.top + y, right: rect.right - x, bottom: rect.bottom - y }
  return inner.right > inner.left && inner.bottom > inner.top ? inner : null
}
