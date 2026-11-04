import { atLeastTwo, type AtLeastTwo, type ConstituencyCode } from "./codes.ts"

export type LonLat = readonly [lon: number, lat: number]

export type Ring = readonly LonLat[]

export type Polygon = { outer: Ring; holes: readonly Ring[] }

export type Shape = readonly Polygon[]

export type Ranked = { constituency: ConstituencyCode; meters: number }

const METERS_PER_DEGREE = 111_320

export function contains(shape: Shape, point: LonLat): boolean {
  return shape.some(polygon => inRing(polygon.outer, point) && !polygon.holes.some(hole => inRing(hole, point)))
}

function inRing(ring: Ring, [x, y]: LonLat): boolean {
  const last = ring.at(-1)
  if (last === undefined) return false
  let [xj, yj] = last
  let inside = false
  for (const [xi, yi] of ring) {
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    xj = xi
    yj = yi
  }
  return inside
}

export function distanceMeters(shape: Shape, point: LonLat): number {
  if (contains(shape, point)) return 0
  const [lon, lat] = point
  const xScale = Math.cos((lat * Math.PI) / 180) * METERS_PER_DEGREE
  let best = Infinity
  for (const { outer, holes } of shape) {
    for (const ring of [outer, ...holes]) {
      let previous: LonLat | undefined
      for (const current of ring) {
        if (previous !== undefined) {
          const [lonA, latA] = previous
          const [lonB, latB] = current
          const ax = (lonA - lon) * xScale
          const ay = (latA - lat) * METERS_PER_DEGREE
          const dx = (lonB - lon) * xScale - ax
          const dy = (latB - lat) * METERS_PER_DEGREE - ay
          const squared = dx * dx + dy * dy
          const t = squared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / squared))
          best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
        }
        previous = current
      }
    }
  }
  return best
}

export function rank(
  point: LonLat,
  unitShapes: ReadonlyMap<ConstituencyCode, Shape>,
  candidates: AtLeastTwo<ConstituencyCode>,
): AtLeastTwo<Ranked> | null {
  const ranked: Ranked[] = []
  for (const constituency of candidates) {
    const shape = unitShapes.get(constituency)
    if (shape === undefined) return null
    ranked.push({ constituency, meters: distanceMeters(shape, point) })
  }
  return atLeastTwo(ranked.sort((a, b) => a.meters - b.meters))
}
