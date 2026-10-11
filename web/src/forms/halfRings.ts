import type { DeputyId } from "../data/deputyId.ts"
import type { Part, Point, Turnout } from "../sources/shapes.ts"
import { defineForm, DOT_RADIUS, type Anchor, type Mark, type Order, type Scene, type Target } from "./form.ts"
import { textEm } from "./text.ts"

const DOT_PITCHES = 0.42
const LANE_PITCHES = 1
const APART_LANE_PITCHES = 2
const MIN_INNER_PITCHES = 2.5
const ONE_RING_MAX_INNER_PITCHES = 3 * MIN_INNER_PITCHES
const LEAST_INNER_PER_RING = 0.72
const MOST_INNER_PER_RING = 3.55
const HOLE_RATIO = 0.45
const MAX_LOOSENESS = 1.15
// Rings sit one pitch apart, so dots on rings farther apart than this can never crowd each other.
const CROWDING_RINGS = Math.floor(2 * DOT_PITCHES + APART_LANE_PITCHES)
const INNER_STEP = 0.02
const LINK_PITCHES = 1.6
const SEARCH_STEPS = 24
const SNAP_PITCHES = 0.6
const FONT_PX = 12
const LINE_EM = 1.25
const GAP_EM = 0.5
const STACK_EM = 0.2
const LEADER_EM = 0.5
const LEADER_INSET_EM = 0.25

export type Sector = { readonly count: number; readonly apart: boolean }

export type Slot = { readonly ring: number; readonly radius: number; readonly angle: number }

export type Grid = { readonly rings: number; readonly inner: number; readonly sectors: readonly (readonly Slot[])[] }

type Ring = { readonly radius: number; readonly cap: number }

type Filled = { readonly radius: number; readonly count: number }

type Filling = { readonly sectors: Slot[][]; readonly short: number }

type Cursor = { readonly ring: number; readonly radius: number; readonly count: number; next: number }

type Front = { readonly cursor: Cursor; at: number; readonly lean: number; first: Slot | null; latest: Slot | null }

type Fit = { readonly inner: number; readonly looseness: number; readonly sectors: readonly (readonly Slot[])[] }

type Member = { readonly part: Part; readonly apart: boolean; readonly members: readonly DeputyId[] }

type Head = { readonly part: Part; readonly count: number; readonly angle: number; readonly ring: number }

type Box = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

type Label = { readonly head: Head; readonly anchor: Anchor; readonly width: number; x: number; y: number; readonly ideal: Point }

export function placeHalfRings({ main }: { readonly main: Turnout }, { frame, order }: Target): Scene {
  const sectors = [...main.present.map(part => sectorOf(part, false, order)), ...(main.absent ? [sectorOf(main.absent, true, order)] : [])]
  const grid = gridOf(sectors.map(({ members, apart }) => ({ count: members.length, apart })))
  const outer = grid.inner + grid.rings - 1
  const heads = sectors.flatMap(({ part }, i): Head[] => {
    const slots = grid.sectors[i] ?? []
    const ring = Math.max(...slots.map(slot => slot.ring))
    const angles = slots.flatMap(slot => (slot.ring === ring ? [slot.angle] : []))
    return angles.length > 0 ? [{ part, count: slots.length, angle: (Math.max(...angles) + Math.min(...angles)) / 2, ring }] : []
  })
  const reach = grid.sectors.flat().reduce<Box>(
    (box, { radius, angle }) => {
      const x = radius * Math.cos(angle)
      const y = -radius * Math.sin(angle)
      return { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x), bottom: Math.max(box.bottom, y) }
    },
    { left: 0, top: 0, right: 0, bottom: 0 },
  )

  const { area, px } = frame
  const font = FONT_PX * px
  const width = area.right - area.left
  const height = area.bottom - area.top
  const radiusAt = (pitch: number) => Math.min(DOT_RADIUS, DOT_PITCHES * pitch)
  const dotsAt = (pitch: number) => inflate(scale(reach, pitch), radiusAt(pitch))
  const layoutAt = (pitch: number) => {
    const labels = placeLabels(heads, (outer + DOT_PITCHES) * pitch, font)
    return { labels, bounds: labels.map(boxOf(font)).reduce(union, dotsAt(pitch)) }
  }
  const fits = (box: Box) => box.right - box.left <= width && box.bottom - box.top <= height
  const largest = Math.min(DOT_RADIUS / DOT_PITCHES, width / (reach.right - reach.left + 2 * DOT_PITCHES), height / (reach.bottom - reach.top + 2 * DOT_PITCHES))
  let fitted: number | null = fits(layoutAt(largest).bounds) ? largest : null
  if (fitted === null) {
    let crowded = largest
    let roomy = 0
    for (let step = 0; step < SEARCH_STEPS; step++) {
      const middle = (roomy + crowded) / 2
      if (fits(layoutAt(middle).bounds)) roomy = fitted = middle
      else crowded = middle
    }
  }
  const pitch = fitted ?? largest
  const { labels, bounds } = layoutAt(pitch)
  const framed = fitted === null ? dotsAt(pitch) : bounds
  const cx = (area.left + area.right - framed.left - framed.right) / 2
  const cy = (area.top + area.bottom - framed.top - framed.bottom) / 2

  const dots = new Map<DeputyId, Point>()
  const partOf = new Map<DeputyId, Part>()
  // Rays part the sectors and each sector's slots run by angle, so each ring collects its deputies already read from left to right.
  const rings = Array.from({ length: grid.rings }, (): DeputyId[] => [])
  sectors.forEach(({ part, members }, i) => {
    const slots = grid.sectors[i] ?? []
    members.forEach((id, k) => {
      const slot = slots[k]
      if (!slot) return
      dots.set(id, { x: cx + slot.radius * pitch * Math.cos(slot.angle), y: cy - slot.radius * pitch * Math.sin(slot.angle) })
      partOf.set(id, part)
      rings[slot.ring]?.push(id)
    })
  })

  const marks = labels.flatMap((label): Mark[] => {
    const { head, anchor, x, y, ideal } = label
    const at = { x: cx + x, y: cy + y }
    const text: Mark = { kind: "label", at, count: head.count, text: head.part.label, title: `${head.count} · ${head.part.title}`, size: font, lay: { kind: "inline", anchor } }
    if (head.ring === grid.rings - 1 && Math.hypot(x - ideal.x, y - ideal.y) <= LEADER_EM * font) return [text]
    const edge = (grid.inner + head.ring + DOT_PITCHES) * pitch + LEADER_INSET_EM * font
    const from = { x: cx + edge * Math.cos(head.angle), y: cy - edge * Math.sin(head.angle) }
    const to = { x: at.x + (anchor === "start" ? -1 : 1) * LEADER_INSET_EM * font, y: at.y }
    return [{ kind: "rule", from, to, tone: "grid" }, text]
  })

  return {
    card: "beside",
    radius: radiusAt(pitch),
    snap: SNAP_PITCHES * pitch,
    dots,
    hollow: new Set(sectors.flatMap(({ apart, members }) => (apart ? members : []))),
    marks,
    lines: rings,
    where: id => {
      const part = partOf.get(id)
      return part ? { kind: "part", part, within: "le secteur" } : null
    },
  }
}

export const halfRings = defineForm({ label: "Demi-anneaux", slots: { main: ["turnout"] }, place: placeHalfRings })

export function halfRingGrid(sectors: readonly Sector[]): Grid {
  const dots = total(sectors.map(({ count }) => count))
  let best: (Grid & { readonly loose: boolean; readonly score: number }) | null = null
  for (let rings = 1; ; rings++) {
    const low = Math.max(MIN_INNER_PITCHES, LEAST_INNER_PER_RING * (rings - 1))
    const high = rings > 1 ? Math.max(low, MOST_INNER_PER_RING * (rings - 1)) : ONE_RING_MAX_INNER_PITCHES
    const found = tightest(sectors, dots, rings, low, high)
    if (!found) continue
    const loose = found.looseness > MAX_LOOSENESS
    const hole = found.inner / (found.inner + rings - 1)
    const score = Math.abs(hole - HOLE_RATIO) + 2 * (found.looseness - 1)
    if (best === null || (!loose && best.loose) || (loose === best.loose && score < best.score))
      best = { rings, inner: found.inner, sectors: found.sectors, loose, score }
    if (loose && found.inner <= low) return best
  }
}

let lastGrid: { readonly key: string; readonly grid: Grid } | null = null

// The grid depends only on the sector sizes and takes milliseconds to search, so a resize or a new order reuses it.
function gridOf(sectors: readonly Sector[]): Grid {
  const key = JSON.stringify(sectors)
  if (lastGrid?.key !== key) lastGrid = { key, grid: halfRingGrid(sectors) }
  return lastGrid.grid
}

function sectorOf(part: Part, apart: boolean, order: Order): Member {
  return { part, apart, members: [...part.members].sort(order) }
}

function tightest(sectors: readonly Sector[], dots: number, rings: number, low: number, high: number): Fit | null {
  const ringsAt = (step: number): Ring[] =>
    Array.from({ length: rings }, (_, k) => {
      const radius = low + step * INNER_STEP + k
      return { radius, cap: capacity(radius) }
    })
  const roomAt = (step: number) => total(ringsAt(step).map(ring => ring.cap))
  const steps = Math.floor((high - low) / INNER_STEP + 1e-9)
  if (roomAt(steps) < dots) return null
  let roomy = steps
  let crowded = -1
  while (roomy - crowded > 1) {
    const middle = Math.floor((roomy + crowded) / 2)
    if (roomAt(middle) >= dots) roomy = middle
    else crowded = middle
  }
  const fullAt = (step: number) => fill(sectors, ringsAt(step).map(({ radius, cap }) => ({ radius, count: cap }))).short
  const step = firstFit(roomy, steps, fullAt, Math.PI * rings * INNER_STEP)
  if (step === null) return null
  const at = ringsAt(step)
  const room = total(at.map(ring => ring.cap))
  const slots = firstFit(dots, room, count => fill(sectors, distribute(count, at)).short, 1) ?? room
  return { inner: low + step * INNER_STEP, looseness: room / slots, sectors: fill(sectors, distribute(slots, at)).sectors }
}

// The lanes make the fit irregular in the radius and the slot total: the search jumps ahead by what was missing, twice as far
// when that did not help, then steps back, twice as far each time the value behind still fits.
function firstFit(from: number, to: number, shortAt: (value: number) => number, perStep: number): number | null {
  let at = from
  let jump = 0
  let before = Infinity
  for (let short = shortAt(at); short > 0; short = shortAt(at)) {
    if (at >= to) return null
    jump = short < before ? Math.max(1, Math.floor(short / perStep)) : 2 * jump
    before = short
    at = Math.min(to, at + jump)
  }
  for (let back = 1; back > 0; )
    if (at - back >= from && shortAt(at - back) === 0) {
      at -= back
      back *= 2
    } else back = Math.floor(back / 2)
  return at
}

function capacity(radius: number): number {
  return Math.floor(Math.PI / (2 * Math.asin(1 / (2 * radius)))) + 1
}

function distribute(slots: number, rings: readonly Ring[]): Filled[] {
  const weight = total(rings.map(ring => ring.radius))
  const shares = rings.map(({ radius, cap }) => {
    const raw = (slots * radius) / weight
    return { radius, cap, count: Math.min(cap, Math.floor(raw)), rest: raw - Math.floor(raw) }
  })
  const byRest = shares.toSorted((a, b) => b.rest - a.rest)
  let missing = slots - total(shares.map(share => share.count))
  for (let pass = 0; missing > 0 && pass <= slots; pass++)
    for (const share of byRest)
      if (missing > 0 && share.count < share.cap) {
        share.count++
        missing--
      }
  return shares
}

// A slot joins a sector only to the right of every earlier sector's dots and a lane clear of them, so sectors read in the parts'
// order along any ray. Each sector grows from its outer ring inwards, one dot at a time next to a dot it already has, so it stays
// in one piece beside its label; the last sector grows from the base line on the right, so the half-turn ends there.
function fill(sectors: readonly Sector[], rings: readonly Filled[]): Filling {
  const cursors = rings.map(({ radius, count }, ring): Cursor => ({ ring, radius, count, next: 0 }))
  const earlier: { readonly apart: boolean; readonly last: readonly (Point | undefined)[] }[] = []
  const filled: Slot[][] = []
  let rightmost = Infinity
  for (const [i, { count, apart }] of sectors.entries()) {
    const after = sectors.slice(i + 1).find(sector => sector.count > 0)
    for (const cursor of cursors) {
      const crowded = (angle: number) =>
        angle > rightmost - 1e-9 || earlier.some(other => crowds(pointOf(cursor.radius, angle), cursor.ring, other.last, apart || other.apart))
      while (cursor.next < cursor.count && crowded(angleOf(cursor, cursor.next))) cursor.next++
    }
    const taken = grow(cursors, count, after ? DOT_PITCHES + laneOf(apart || after.apart) / 2 : null)
    if (taken.length < count) return { sectors: filled, short: total(sectors.slice(i).map(sector => sector.count)) - taken.length }
    const last: (Point | undefined)[] = []
    for (const { ring, radius, angle } of taken) {
      last[ring] = pointOf(radius, angle)
      rightmost = Math.min(rightmost, angle)
    }
    earlier.push({ apart, last })
    filled.push(taken)
  }
  return { sectors: filled.map(slots => slots.toSorted((a, b) => b.angle - a.angle || a.ring - b.ring)), short: 0 }
}

// lean is the half lane on the sector's right: leaning on it keeps the sector's right edge parallel to a ray. Without one, the
// sector is the last and grows leftwards from the base line.
function grow(cursors: readonly Cursor[], count: number, lean: number | null): Slot[] {
  const fromRight = lean === null
  const step = fromRight ? -1 : 1
  const fronts = cursors.map((cursor): Front => ({ cursor, at: fromRight ? cursor.count - 1 : cursor.next, lean: Math.asin((lean ?? 0) / cursor.radius), first: null, latest: null }))
  const outermost = fronts.findLast(isOpen)
  const outerFirst = fronts.toReversed()
  const taken: Slot[] = []
  while (taken.length < count) {
    let best: Front | null = null
    let bestKey = -Infinity
    for (const front of outerFirst) {
      const outer = fronts[front.cursor.ring + 1]
      if (front.latest === null) {
        passBehind(front, outer?.first ?? null, step)
        if (taken.length === 0 ? front !== outermost : !outer || !touches(slotAt(front), outer)) continue
      }
      if (!isOpen(front)) continue
      const angle = angleOf(front.cursor, front.at)
      const key = fromRight ? -angle : angle - front.lean
      if (key > bestKey) {
        best = front
        bestKey = key
      }
    }
    if (!best) break
    const slot = slotAt(best)
    taken.push(slot)
    best.first ??= slot
    best.latest = slot
    best.at += step
  }
  if (!fromRight) for (const { cursor, at } of fronts) cursor.next = at
  return taken
}

// A ring the sector has not reached yet joins it next to the sector's first dot on the ring outside; a slot already past that dot,
// on the side the sector grows away from, can never join it.
function passBehind(front: Front, outerFirst: Slot | null, step: number): void {
  while (outerFirst && isOpen(front) && step * (outerFirst.angle - angleOf(front.cursor, front.at)) < 0 && !near(slotAt(front), outerFirst)) front.at += step
}

function isOpen({ cursor, at }: Front): boolean {
  return at >= cursor.next && at < cursor.count
}

function slotAt({ cursor, at }: Front): Slot {
  return { ring: cursor.ring, radius: cursor.radius, angle: angleOf(cursor, at) }
}

function touches(slot: Slot, { first, latest }: Front): boolean {
  if (!first || !latest) return false
  return (slot.angle <= Math.max(first.angle, latest.angle) && slot.angle >= Math.min(first.angle, latest.angle)) || near(slot, first) || near(slot, latest)
}

function near(a: Slot, b: Slot): boolean {
  const p = pointOf(a.radius, a.angle)
  const q = pointOf(b.radius, b.angle)
  return Math.hypot(p.x - q.x, p.y - q.y) <= LINK_PITCHES
}

function angleOf({ count }: { readonly count: number }, j: number): number {
  return count > 1 ? Math.PI * (1 - j / (count - 1)) : Math.PI / 2
}

function crowds(at: Point, ring: number, last: readonly (Point | undefined)[], apart: boolean): boolean {
  const reach = 2 * DOT_PITCHES + laneOf(apart)
  for (let near = Math.max(0, ring - CROWDING_RINGS); near <= ring + CROWDING_RINGS; near++) {
    const other = last[near]
    if (other && Math.hypot(at.x - other.x, at.y - other.y) < reach - 1e-9) return true
  }
  return false
}

function pointOf(radius: number, angle: number): Point {
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
}

function laneOf(apart: boolean): number {
  return apart ? APART_LANE_PITCHES : LANE_PITCHES
}

function placeLabels(heads: readonly Head[], edge: number, font: number): Label[] {
  const clear = edge + GAP_EM * font
  const height = LINE_EM * font
  const box = boxOf(font)
  const labels = heads.map(head => {
    const anchor: Anchor = head.angle > Math.PI / 2 ? "end" : "start"
    const width = textEm(`${head.count} ${head.part.label}`) * font
    const at = (distance: number) => ({ x: distance * Math.cos(head.angle), y: -distance * Math.sin(head.angle) })
    const distance = least(clear, clear + width + height, d => distanceTo(box({ anchor, width, ...at(d) })) >= clear)
    const ideal = at(distance)
    return { head, anchor, width, ...ideal, ideal }
  })
  // Every ray rises from the base line, so lifting a label never brings it back over the arc.
  for (const side of ["start", "end"] as const) {
    const stacked = labels.filter(label => label.anchor === side).sort((a, b) => b.y - a.y)
    stacked.forEach((label, i) => {
      const below = stacked[i - 1]
      if (below) label.y = Math.min(label.y, below.y - height - STACK_EM * font)
    })
  }
  return labels
}

function least(low: number, high: number, enough: (value: number) => boolean): number {
  if (enough(low)) return low
  let short = low
  let long = high
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const middle = (short + long) / 2
    if (enough(middle)) long = middle
    else short = middle
  }
  return long
}

function boxOf(font: number): (label: Pick<Label, "anchor" | "width" | "x" | "y">) => Box {
  const height = LINE_EM * font
  return ({ anchor, width, x, y }) => {
    const left = anchor === "start" ? x : x - width
    return { left, top: y - height / 2, right: left + width, bottom: y + height / 2 }
  }
}

function distanceTo({ left, top, right, bottom }: Box): number {
  return Math.hypot(Math.min(Math.max(0, left), right), Math.min(Math.max(0, top), bottom))
}

function scale(box: Box, by: number): Box {
  return { left: box.left * by, top: box.top * by, right: box.right * by, bottom: box.bottom * by }
}

function inflate(box: Box, by: number): Box {
  return { left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by }
}

function union(a: Box, b: Box): Box {
  return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}
