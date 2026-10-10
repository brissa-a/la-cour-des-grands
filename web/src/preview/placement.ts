export type Point = { x: number; y: number }

export type Rect = { left: number; top: number; right: number; bottom: number }

export type Side = "left" | "right" | "below" | "above"

export type Anchor = Point & { radius: number }

export type Placement = {
  side: Side
  left: number
  top: number
  arrow: number
  leader: number
}

export type PlacementInput = {
  anchor: Anchor
  width: number
  height: number
  bounds: Rect
  obstacles: readonly Rect[]
  dots: readonly Point[]
  dotRadius: number
  keep: Side | null
}

export const GAP = 10
export const ARROW_INSET = 14
const BLOCKED = 1000
const SIDES: readonly Side[] = ["left", "right", "below", "above"]

export function placeBeside(input: PlacementInput): Placement {
  const candidates = SIDES.map(side => candidate(input, side))
  const kept = candidates.find(c => c.side === input.keep)
  if (kept && kept.score < BLOCKED) return kept.placement
  const order = towardsRostrum(input)
  candidates.sort((a, b) => a.score - b.score || order.indexOf(a.side) - order.indexOf(b.side))
  const best = candidates[0]
  if (!best) throw new Error("placeBeside: no candidate")
  return best.placement
}

export function placeAbove(input: PlacementInput): Placement {
  const { anchor, width, height, bounds, dots, dotRadius } = input
  const minLeft = Math.max(bounds.left, anchor.x - width + ARROW_INSET)
  const maxLeft = Math.min(bounds.right - width, anchor.x - ARROW_INSET)
  let best: Placement | null = null
  for (let left = minLeft; left <= maxLeft; left += 4) {
    const right = left + width
    let highest = anchor.y - anchor.radius
    for (const dot of dots) {
      if (dot.x + dotRadius > left && dot.x - dotRadius < right && dot.y < anchor.y) highest = Math.min(highest, dot.y - dotRadius)
    }
    const bottom = highest - GAP
    const top = bottom - height
    if (top < bounds.top) continue
    const rect = { left, top, right, bottom }
    if (input.obstacles.some(o => overlaps(o, rect))) continue
    const centering = Math.abs(left + width / 2 - anchor.x)
    const bestCentering = best ? Math.abs(best.left + width / 2 - anchor.x) : Infinity
    if (!best || top > best.top || (top === best.top && centering < bestCentering)) {
      best = { side: "above", left, top, arrow: anchor.x - left, leader: anchor.y - anchor.radius - bottom }
    }
  }
  return best ?? placeBeside(input)
}

function candidate(input: PlacementInput, side: Side): { side: Side; score: number; placement: Placement } {
  const { anchor, width, height, bounds } = input
  const reach = anchor.radius + GAP
  const horizontal = side === "left" || side === "right"
  const along = horizontal
    ? slide(anchor.y, height, bounds.top, bounds.bottom)
    : slide(anchor.x, width, bounds.left, bounds.right)
  const left = side === "left" ? anchor.x - reach - width : side === "right" ? anchor.x + reach : along
  const top = side === "above" ? anchor.y - reach - height : side === "below" ? anchor.y + reach : along
  const rect = { left, top, right: left + width, bottom: top + height }
  const arrow = horizontal ? anchor.y - top : anchor.x - left
  const length = horizontal ? height : width
  const blocked =
    !inside(rect, bounds) ||
    input.obstacles.some(o => overlaps(o, rect)) ||
    arrow < ARROW_INSET ||
    arrow > length - ARROW_INSET
  const covered = input.dots.filter(d => d.x > rect.left && d.x < rect.right && d.y > rect.top && d.y < rect.bottom).length
  return { side, score: covered + (blocked ? BLOCKED : 0), placement: { side, left, top, arrow, leader: 0 } }
}

function slide(center: number, size: number, min: number, max: number): number {
  return Math.min(Math.max(center - size / 2, min), max - size)
}

function towardsRostrum({ anchor, dots }: PlacementInput): readonly Side[] {
  const xs = dots.map(d => d.x)
  const middle = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : anchor.x
  const bottom = dots.reduce((max, d) => Math.max(max, d.y), anchor.y)
  const angle = Math.atan2(bottom - anchor.y, anchor.x - middle) * (180 / Math.PI)
  if (angle < 30) return ["left", "below", "above", "right"]
  if (angle > 150) return ["right", "below", "above", "left"]
  return ["below", "above", "left", "right"]
}

function inside(rect: Rect, bounds: Rect): boolean {
  return rect.left >= bounds.left && rect.top >= bounds.top && rect.right <= bounds.right && rect.bottom <= bounds.bottom
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}
