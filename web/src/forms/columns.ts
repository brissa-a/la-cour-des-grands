import type { DeputyId } from "../data/deputyId.ts"
import type { Part, Parts, Point } from "../sources/shapes.ts"
import { defineForm, DOT_RADIUS, type Lay, type Mark, type Scene, type Target } from "./form.ts"
import { bestGeometry, centerOffset, gridStep, MAX_COLUMN_WIDTH, type Bounds, type Geometry } from "./grid.ts"

const TICK_GAP_EM = 0.4
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
const RADIUS_PITCHES = 0.42
const SNAP_PITCHES = 0.6
const NARROW_CHARS = "fijlrtI'’.,;:·-"
const WIDE_CHARS = "mwMW&"

type Bucket = { part: Part; members: readonly DeputyId[] }

type Room = Bounds & { readonly depth: number }

type Layout = { labelRoom: Room; geometry: Geometry; font: number }

export function placeColumns({ main }: { readonly main: Parts }, { frame, order }: Target): Scene {
  const buckets: Bucket[] = main.parts.map(part => ({ part, members: [...part.members].sort(order) }))

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
  const flatFits = buckets.every(b => Math.max(textEm(String(b.members.length)), textEm(b.part.label)) * flatFont <= flatWidth)

  const slantedEm = buckets.map(b => textEm(`${b.members.length} ${b.part.label}`))
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
  const dots = new Map<DeputyId, Point>()
  const partOf = new Map<DeputyId, Part>()
  const byRow = new Map<number, DeputyId[]>()
  const columns = buckets.map(({ part, members }, i) => {
    const x = axisLeft + (1 + i * (across + gap)) * pitch
    members.forEach((id, k) => {
      const row = Math.floor(k / across)
      dots.set(id, { x: x + ((k % across) + 0.5) * pitch, y: baseline - (row + 0.5) * pitch })
      partOf.set(id, part)
      const inRow = byRow.get(row)
      if (inRow) inRow.push(id)
      else byRow.set(row, [id])
    })
    return { part, count: members.length, x, width: across * pitch }
  })

  const lay: Lay = flatFits ? { kind: "flat", lineHeight: LINE_EM * font } : { kind: "slanted", degrees: SLANT_DEGREES }
  const labelY = baseline + (flatFits ? FLAT_FIRST_LINE_EM : SLANT_DROP_EM) * font
  const marks: Mark[] = []
  const first = columns[0]
  const last = columns.at(-1)
  if (first && last) {
    const left = first.x - pitch
    const right = last.x + last.width + pitch
    const rowSize = gridStep(rows, across)
    for (let line = rowSize; line <= rows; line += rowSize) {
      const y = baseline - line * pitch
      marks.push(
        { kind: "rule", from: { x: left, y }, to: { x: right, y }, tone: "grid" },
        { kind: "tick", at: { x: left - font * TICK_GAP_EM, y }, text: String(line * across), size: font },
      )
    }
    marks.push({ kind: "rule", from: { x: left, y: baseline }, to: { x: right, y: baseline }, tone: "base" })
    for (const { part, count, x, width } of columns)
      marks.push({ kind: "label", at: { x: x + width / 2, y: labelY }, count, text: part.label, title: `${count} · ${part.title}`, size: font, lay })
  }

  return {
    card: "above",
    radius: Math.min(DOT_RADIUS, pitch * RADIUS_PITCHES),
    snap: SNAP_PITCHES * pitch,
    dots,
    marks,
    lines: [...byRow.values()],
    where: id => {
      const part = partOf.get(id)
      return part ? { kind: "part", part, within: "la colonne" } : null
    },
  }
}

export const columns = defineForm({ label: "Colonnes", slots: { main: ["nominal", "ordinal"] }, place: placeColumns })

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
