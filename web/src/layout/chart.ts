import type { Coloring } from "../coloring/coloring.ts"
import { MISSING } from "../coloring/coloring.ts"
import { numberView } from "../coloring/views.ts"
import type { Deputy, DeputyId } from "../data/assembly.ts"

export type Point = { x: number; y: number }

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
}

const MAX_COLUMN_WIDTH = 30
const AREA_WIDTH = 1.75
const AREA_CENTER = 0.12
const AREA_HEIGHT = 1.05
const BASELINE = 0.1
const LAST = Number.MAX_SAFE_INTEGER

type Bucket = { key: string; label: string; title: string; members: Deputy[] }

export function buildChart(by: Coloring, order: Coloring, deputies: Deputy[], maxRadius: number): Chart {
  const buckets = by.kind === "category" ? categoryBuckets(by, deputies) : numberBuckets(by, deputies)
  const rank = sortRank(order)
  for (const bucket of buckets) bucket.members.sort((a, b) => rank(a.id) - rank(b.id) || a.last_name.localeCompare(b.last_name))

  const largest = Math.max(1, ...buckets.map(b => b.members.length))
  const { width: columnWidth, gap, rows, pitch } = bestGeometry(buckets.length, largest)
  const span = buckets.length * columnWidth + (buckets.length - 1) * gap
  const left = AREA_CENTER - (span * pitch) / 2

  const positions = new Map<DeputyId, Point>()
  const columns = buckets.map((bucket, i): ChartColumn => {
    const x = left + i * (columnWidth + gap) * pitch
    bucket.members.forEach((deputy, k) => {
      positions.set(deputy.id, {
        x: x + ((k % columnWidth) + 0.5) * pitch,
        y: BASELINE - (Math.floor(k / columnWidth) + 0.5) * pitch,
      })
    })
    return { key: bucket.key, label: bucket.label, title: bucket.title, count: bucket.members.length, x, width: columnWidth * pitch }
  })

  const rowSize = gridStep(rows, columnWidth)
  return {
    title: by.title,
    positions,
    radius: Math.min(maxRadius, pitch * 0.42),
    pitch,
    baseline: BASELINE,
    columnWidth,
    columns,
    gridRows: Array.from({ length: Math.floor(rows / rowSize) }, (_, i) => (i + 1) * rowSize),
  }
}

function bestGeometry(columns: number, largest: number) {
  let best = { width: 1, gap: 1, rows: largest, pitch: 0 }
  for (let width = 1; width <= MAX_COLUMN_WIDTH; width++) {
    const gap = Math.max(1, Math.round(width / 4))
    const rows = Math.ceil(largest / width)
    const pitch = Math.min(AREA_WIDTH / (columns * width + (columns - 1) * gap), AREA_HEIGHT / rows)
    if (pitch > best.pitch) best = { width, gap, rows, pitch }
  }
  return best
}

function gridStep(rows: number, columnWidth: number): number {
  const target = (rows * columnWidth) / 4
  const deputies = [5, 10, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200].find(step => step >= target && step % columnWidth === 0)
  return deputies ? deputies / columnWidth : Math.max(1, Math.round(rows / 4))
}

function categoryBuckets(by: Extract<Coloring, { kind: "category" }>, deputies: Deputy[]): Bucket[] {
  const buckets = by.items.map((item): Bucket => ({ key: item.value, label: item.label, title: item.title, members: [] }))
  const byValue = new Map(buckets.map(b => [b.key, b]))
  for (const deputy of deputies) byValue.get(by.valueOf(deputy.id))?.members.push(deputy)
  return buckets
}

function numberBuckets(by: Extract<Coloring, { kind: "number" }>, deputies: Deputy[]): Bucket[] {
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
  const first = Math.floor(min / width) * width
  const count = Math.floor((max - first) / width) + 1
  const buckets = Array.from({ length: count }, (_, i): Bucket => {
    const from = first + i * width
    const label = integers ? `${from}–${from + width - 1}` : `${format(from)}–${format(from + width)}`
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
