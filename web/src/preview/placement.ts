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
const SIDES: readonly Side[] = ["left", "right", "below", "above"]

type Candidate = { side: Side; blocked: boolean; outside: number; overlap: number; covered: number; placement: Placement }

// With every side blocked, a card over the legend or the dots still beats a card cut off by the stage's edge.
export function placeBeside(input: PlacementInput): Placement {
  const candidates = SIDES.map(side => candidate(input, side))
  const kept = candidates.find(c => c.side === input.keep)
  if (kept && !kept.blocked) return kept.placement
  const order = towardsRostrum(input)
  candidates.sort(
    (a, b) =>
      Number(a.blocked) - Number(b.blocked) ||
      a.outside - b.outside ||
      a.overlap - b.overlap ||
      a.covered - b.covered ||
      order.indexOf(a.side) - order.indexOf(b.side),
  )
  const best = candidates[0]
  if (!best) throw new Error("placeBeside: no candidate")
  return best.blocked ? within(best.placement, input) : best.placement
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
    if (input.obstacles.some(o => area(intersection(o, rect)) > 0)) continue
    const centering = Math.abs(left + width / 2 - anchor.x)
    const bestCentering = best ? Math.abs(best.left + width / 2 - anchor.x) : Infinity
    if (!best || top > best.top || (top === best.top && centering < bestCentering)) {
      best = { side: "above", left, top, arrow: anchor.x - left, leader: anchor.y - anchor.radius - bottom }
    }
  }
  return best ?? placeBeside(input)
}

function candidate(input: PlacementInput, side: Side): Candidate {
  const { anchor, width, height, bounds, obstacles } = input
  const reach = anchor.radius + GAP
  const horizontal = side === "left" || side === "right"
  const across = horizontal ? spanX : spanY
  const along = horizontal ? spanY : spanX
  const start = { left: anchor.x - reach - width, right: anchor.x + reach, above: anchor.y - reach - height, below: anchor.y + reach }[side]
  const end = start + (horizontal ? width : height)
  const center = horizontal ? anchor.y : anchor.x
  const length = horizontal ? height : width
  const inTheWay = obstacles.filter(o => across(o)[0] < end && start < across(o)[1]).map(along)
  const [min, max] = clear(center, along(bounds), inTheWay)
  const from = slide(center, length, min, max)
  const rect = horizontal ? { left: start, top: from, right: end, bottom: from + length } : { left: from, top: start, right: from + length, bottom: end }
  const arrow = center - from
  const outside = area(rect) - area(intersection(rect, bounds))
  const overlap = obstacles.reduce((sum, o) => sum + area(intersection(o, rect)), 0)
  const covered = input.dots.filter(d => d.x > rect.left && d.x < rect.right && d.y > rect.top && d.y < rect.bottom).length
  const blocked = outside > 0 || overlap > 0 || arrow < ARROW_INSET || arrow > length - ARROW_INSET
  return { side, blocked, outside, overlap, covered, placement: { side, left: rect.left, top: rect.top, arrow, leader: 0 } }
}

function within(placement: Placement, { anchor, width, height, bounds }: PlacementInput): Placement {
  const left = Math.max(bounds.left, Math.min(placement.left, bounds.right - width))
  const top = Math.max(bounds.top, Math.min(placement.top, bounds.bottom - height))
  const horizontal = placement.side === "left" || placement.side === "right"
  const length = horizontal ? height : width
  const arrow = Math.max(ARROW_INSET, Math.min((horizontal ? anchor.y - top : anchor.x - left), length - ARROW_INSET))
  return { ...placement, left, top, arrow }
}

function clear(center: number, [min, max]: readonly [number, number], inTheWay: readonly (readonly [number, number])[]): [number, number] {
  let low = min
  let high = max
  for (const [start, end] of inTheWay) {
    if (end <= center) low = Math.max(low, end)
    else if (start >= center) high = Math.min(high, start)
  }
  return [low, high]
}

function slide(center: number, size: number, min: number, max: number): number {
  return Math.min(Math.max(center - size / 2, min), max - size)
}

function spanX({ left, right }: Rect): [number, number] {
  return [left, right]
}

function spanY({ top, bottom }: Rect): [number, number] {
  return [top, bottom]
}

function intersection(a: Rect, b: Rect): Rect {
  return { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) }
}

function area({ left, top, right, bottom }: Rect): number {
  return Math.max(0, right - left) * Math.max(0, bottom - top)
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
