import type { Coloring } from "../coloring/coloring.ts"
import { MISSING } from "../coloring/coloring.ts"
import { numberView } from "../coloring/views.ts"
import type { Deputy, DeputyId } from "../data/assembly.ts"
import type { Rect } from "../preview/placement.ts"

export type Point = { x: number; y: number }

export type ChartFrame = { area: Rect; px: number }

export type ColumnLabels = { kind: "flat"; y: number; lineHeight: number } | { kind: "slanted"; y: number; degrees: number }

export type ChartColumn = { key: string; label: string; title: string; count: number; x: number; width: number }

export type Chart = {
  title: string
  positions: ReadonlyMap<DeputyId, Point>
  radius: number
  pitch: number
  baseline: number
  columnWidth: number
  columns: ChartColumn[]
  gridRows: number[]
  fontSize: number
  labels: ColumnLabels
}

export const TICK_GAP_EM = 0.4

const MAX_COLUMN_WIDTH = 30
const LAST = Number.MAX_SAFE_INTEGER
const FONT_PX = 12
const TOP_EM = 0.6
const LINE_EM = 1.25
const FLAT_FIRST_LINE_EM = 1.3
const FLAT_DEPTH_EM = 3
const FLAT_PADDING_EM = 0.5
const SLANT_DEGREES = 45
const SLANT = Math.sin((SLANT_DEGREES * Math.PI) / 180)
const SLANT_DROP_EM = 0.9
const SLANT_LINE_EM = 1.1
const ASCENT_EM = 0.78
const DESCENT_EM = 0.25
const LABEL_SHARE = 0.4
const FONT_SEARCH_STEPS = 12
const NARROW_CHARS = "fijlrtI'’.,;:·-"
const WIDE_CHARS = "mwMW&"

type ChartedDeputy = Pick<Deputy, "id" | "last_name">

type Bucket = { key: string; label: string; title: string; members: ChartedDeputy[] }

type Room = { width: number; height: number; depth: number; tickWidth: number; overhangs: readonly number[] }

type Geometry = { across: number; gap: number; rows: number; pitch: number }

type Layout = { labelRoom: Room; geometry: Geometry; font: number }

export function buildChart(by: Coloring, order: Coloring, deputies: readonly ChartedDeputy[], maxRadius: number, frame: ChartFrame): Chart {
  const buckets = by.kind === "category" ? categoryBuckets(by, deputies) : numberBuckets(by, deputies)
  const rank = sortRank(order)
  for (const bucket of buckets) bucket.members.sort((a, b) => rank(a.id) - rank(b.id) || a.last_name.localeCompare(b.last_name))

  const { area, px } = frame
  const fontFor = (depthEm: number) => Math.min(FONT_PX * px, (LABEL_SHARE * (area.bottom - area.top)) / depthEm)
  const largest = Math.max(1, ...buckets.map(b => b.members.length))
  const widestTick = String(largest + MAX_COLUMN_WIDTH)
  const room = (font: number, depth: number, overhangs: readonly number[]): Room => ({
    width: area.right - area.left,
    height: Math.max(px, area.bottom - area.top - TOP_EM * font - depth),
    depth,
    tickWidth: (TICK_GAP_EM + textEm(widestTick)) * font,
    overhangs,
  })

  const flatFont = fontFor(FLAT_DEPTH_EM)
  const flatRoom = room(flatFont, FLAT_DEPTH_EM * flatFont, [])
  const flat = bestGeometry(buckets.length, largest, flatRoom)
  const flatWidth = (flat.across + Math.min(flat.gap, 2)) * flat.pitch - FLAT_PADDING_EM * flatFont
  const flatFits = buckets.every(b => Math.max(textEm(String(b.members.length)), textEm(b.label)) * flatFont <= flatWidth)

  const slantedEm = buckets.map(b => textEm(`${b.members.length} ${b.label}`))
  const slantDepthEm = SLANT_DROP_EM + SLANT * (Math.max(0, ...slantedEm) + DESCENT_EM)
  const slantedAt = (font: number): Layout => {
    const labelRoom = room(font, slantDepthEm * font, slantedEm.map(length => SLANT * (length + ASCENT_EM) * font))
    return { labelRoom, geometry: bestGeometry(buckets.length, largest, labelRoom), font }
  }
  const linesApart = ({ geometry: { across, gap, pitch }, font }: Layout) => (across + gap) * pitch * SLANT >= SLANT_LINE_EM * font
  const largestApart = (apart: Layout, crowded: Layout, steps: number): Layout => {
    if (steps === 0) return apart
    const middle = slantedAt((apart.font + crowded.font) / 2)
    return linesApart(middle) ? largestApart(middle, crowded, steps - 1) : largestApart(apart, middle, steps - 1)
  }
  const slanted = () => {
    const full = slantedAt(fontFor(slantDepthEm))
    return linesApart(full) ? full : largestApart(slantedAt(0), full, FONT_SEARCH_STEPS)
  }
  const { labelRoom, geometry, font } = flatFits ? { labelRoom: flatRoom, geometry: flat, font: flatFont } : slanted()
  const { across, gap, rows, pitch } = geometry

  const span = (buckets.length * across + (buckets.length - 1) * gap + 2) * pitch
  const leftOverhang = Math.max(labelRoom.tickWidth, ...labelRoom.overhangs.map((overhang, i) => overhang - centerOffset(i, across, gap) * pitch))
  const axisLeft = area.left + (labelRoom.width - span - leftOverhang) / 2 + leftOverhang
  const baseline = area.bottom - labelRoom.depth
  const positions = new Map<DeputyId, Point>()
  const columns = buckets.map((bucket, i): ChartColumn => {
    const x = axisLeft + (1 + i * (across + gap)) * pitch
    bucket.members.forEach((deputy, k) => {
      positions.set(deputy.id, {
        x: x + ((k % across) + 0.5) * pitch,
        y: baseline - (Math.floor(k / across) + 0.5) * pitch,
      })
    })
    return { key: bucket.key, label: bucket.label, title: bucket.title, count: bucket.members.length, x, width: across * pitch }
  })

  const rowSize = gridStep(rows, across)
  return {
    title: by.title,
    positions,
    radius: Math.min(maxRadius, pitch * 0.42),
    pitch,
    baseline,
    columnWidth: across,
    columns,
    gridRows: Array.from({ length: Math.floor(rows / rowSize) }, (_, i) => (i + 1) * rowSize),
    fontSize: font,
    labels: flatFits
      ? { kind: "flat", y: baseline + FLAT_FIRST_LINE_EM * font, lineHeight: LINE_EM * font }
      : { kind: "slanted", y: baseline + SLANT_DROP_EM * font, degrees: SLANT_DEGREES },
  }
}

function bestGeometry(columns: number, largest: number, { width, height, tickWidth, overhangs }: Room): Geometry {
  let best: Geometry = { across: 1, gap: 1, rows: largest, pitch: 0 }
  for (let across = 1; across <= MAX_COLUMN_WIDTH; across++) {
    const gap = Math.max(1, Math.round(across / 4))
    const rows = Math.ceil(largest / across)
    const span = columns * across + (columns - 1) * gap + 2
    const fits = overhangs.map((overhang, i) => (width - overhang) / (span - centerOffset(i, across, gap)))
    const pitch = Math.min(height / rows, (width - tickWidth) / span, ...fits)
    if (pitch > best.pitch) best = { across, gap, rows, pitch }
  }
  return best
}

function centerOffset(column: number, across: number, gap: number): number {
  return 1 + column * (across + gap) + across / 2
}

// Each glyph class is as wide as its widest member in SF Pro, semibold digits included, so labels placed without measuring the DOM still clear each other.
function textEm(text: string): number {
  let em = 0
  for (const char of text) em += charEm(char)
  return em
}

function charEm(char: string): number {
  if (char === " ") return 0.3
  if (NARROW_CHARS.includes(char)) return 0.48
  if (WIDE_CHARS.includes(char)) return 1
  if (char >= "0" && char <= "9") return 0.68
  return char === char.toLowerCase() ? 0.62 : 0.78
}

function gridStep(rows: number, columnWidth: number): number {
  const target = (rows * columnWidth) / 4
  const deputies = [5, 10, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200].find(step => step >= target && step % columnWidth === 0)
  return deputies ? deputies / columnWidth : Math.max(1, Math.round(rows / 4))
}

function categoryBuckets(by: Extract<Coloring, { kind: "category" }>, deputies: readonly ChartedDeputy[]): Bucket[] {
  const buckets = by.items.map((item): Bucket => ({ key: item.value, label: item.label, title: item.title, members: [] }))
  const byValue = new Map(buckets.map(b => [b.key, b]))
  for (const deputy of deputies) byValue.get(by.valueOf(deputy.id))?.members.push(deputy)
  return buckets
}

function numberBuckets(by: Extract<Coloring, { kind: "number" }>, deputies: readonly ChartedDeputy[]): Bucket[] {
  const numbers = new Map<DeputyId, number>()
  for (const deputy of deputies) {
    const value = by.valueOf(deputy.id)
    if (value !== MISSING) numbers.set(deputy.id, Number(value))
  }
  const values = [...numbers.values()]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = numberView(by.key).binWidth ?? niceWidth((max - min) / 10)
  const integers = values.every(Number.isInteger) && Number.isInteger(width)
  const unit = by.unit ? ` ${by.unit}` : ""
  const first = Math.floor(min / width) * width
  const count = Math.floor((max - first) / width) + 1
  const buckets = Array.from({ length: count }, (_, i): Bucket => {
    const from = first + i * width
    const range = integers ? `${from}–${from + width - 1}` : `${format(from)}–${format(from + width)}`
    const label = `${range}${unit}`
    return { key: String(from), label, title: label, members: [] }
  })
  for (const deputy of deputies) {
    const value = numbers.get(deputy.id)
    if (value !== undefined) buckets[Math.floor((value - first) / width)]?.members.push(deputy)
  }
  const missing = deputies.filter(d => !numbers.has(d.id))
  if (missing.length) buckets.push({ key: MISSING, label: "Non renseigné", title: "Non renseigné", members: missing })
  return buckets
}

function sortRank(order: Coloring): (id: DeputyId) => number {
  if (order.kind === "category") {
    const index = new Map(order.items.map((item, i) => [item.value, i]))
    return id => index.get(order.valueOf(id)) ?? LAST
  }
  return id => {
    const value = order.valueOf(id)
    return value === MISSING ? LAST : Number(value)
  }
}

function niceWidth(raw: number): number {
  if (raw <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].find(s => s * magnitude >= raw) ?? 10
  return step * magnitude
}

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })

function format(n: number): string {
  return numberFormat.format(n)
}
