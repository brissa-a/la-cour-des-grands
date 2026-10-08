import type { Point } from "./placement.ts"

export type Direction = "left" | "right"

export type Layout = "hemicycle" | "chart"

const HEMICYCLE_ROW_TOLERANCE = 0.025

export function neighbour<Id>(
  positions: ReadonlyMap<Id, Point>,
  id: Id,
  direction: Direction,
  layout: Layout,
  chartRowTolerance: number,
): Id | null {
  const origin = positions.get(id)
  if (!origin) return null
  const project = layout === "hemicycle" ? polar : cartesian
  const from = project(origin)
  const tolerance = layout === "hemicycle" ? HEMICYCLE_ROW_TOLERANCE : chartRowTolerance
  let best: { id: Id; distance: number } | null = null
  for (const [other, point] of positions) {
    if (other === id) continue
    const to = project(point)
    if (Math.abs(to.row - from.row) > tolerance) continue
    const distance = direction === "left" ? from.along - to.along : to.along - from.along
    if (distance <= 0) continue
    if (!best || distance < best.distance) best = { id: other, distance }
  }
  return best?.id ?? null
}

function polar({ x, y }: Point): { row: number; along: number } {
  return { row: Math.hypot(x, y), along: -Math.atan2(Math.abs(y), x) }
}

function cartesian({ x, y }: Point): { row: number; along: number } {
  return { row: y, along: x }
}
