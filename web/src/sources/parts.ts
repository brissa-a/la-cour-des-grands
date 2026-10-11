import type { DeputyId } from "../data/deputyId.ts"
import type { ReadVote } from "../votes/sources.ts"
import { MISSING, NOT_GIVEN, type Categories, type ColoredPart, type Numbers, type Part, type Parts } from "./shapes.ts"
import type { CategoryValues } from "./values.ts"
import { NEUTRAL, PALETTE, POSITION_COLORS } from "./views.ts"

export function categoryParts({ feature, valueOf, table }: CategoryValues, drawn: readonly DeputyId[]): Categories {
  const colors = new Map(table.map((row, i) => [row.value, row.color ?? PALETTE[i % PALETTE.length] ?? NEUTRAL]))
  const keyOf = (id: DeputyId) => valueOf.get(id) ?? MISSING
  const members = membersBy(drawn, keyOf)
  const listed = new Set(table.map(row => row.value))
  const parts: ColoredPart[] = table.flatMap(row => {
    const inPart = members.get(row.value)
    const label = row.short ?? row.label
    return inPart ? [{ key: row.value, label, title: row.label, caption: null, color: colors.get(row.value) ?? NEUTRAL, members: inPart }] : []
  })
  for (const [key, inPart] of members)
    if (key !== MISSING && !listed.has(key)) parts.push({ key, label: key, title: key, caption: null, color: NEUTRAL, members: inPart })
  const missing = members.get(MISSING)
  if (missing) parts.push({ ...missingPart(feature.title, missing), color: NEUTRAL })
  return { title: feature.title, parts, keyOf, colorOf: id => colors.get(keyOf(id)) ?? NEUTRAL }
}

export function voteParts({ vote, table, reading }: ReadVote, drawn: readonly DeputyId[]): Categories {
  const title = `Scrutin n° ${vote.number}`
  const keyOf = (id: DeputyId) => reading.positions.get(id) ?? MISSING
  const members = membersBy(drawn, keyOf)
  const parts: ColoredPart[] = table.order.flatMap(position => {
    const inPart = members.get(position)
    const label = table.label[position]
    return inPart ? [{ key: position, label, title: label, caption: null, color: POSITION_COLORS[position], members: inPart }] : []
  })
  const missing = members.get(MISSING)
  if (missing) parts.push({ ...missingPart(title, missing), color: NEUTRAL })
  return {
    title,
    parts,
    keyOf,
    colorOf: id => {
      const position = reading.positions.get(id)
      return position === undefined ? NEUTRAL : POSITION_COLORS[position]
    },
  }
}

export function binnedParts(numbers: Numbers, binWidth: number | undefined): Parts {
  const { feature, unit, drawn, valueOf } = numbers
  const values = drawn.flatMap(id => {
    const value = valueOf(id)
    return value === null ? [] : [value]
  })
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = binWidth ?? niceWidth((max - min) / 10)
  const integers = values.every(Number.isInteger) && Number.isInteger(width)
  const suffix = unit ? ` ${unit}` : ""
  const first = Math.floor(min / width) * width
  const count = Math.floor((max - first) / width) + 1
  const caption = unit ? null : feature.title
  const bins = Array.from({ length: count }, (_, i): Bin => {
    const from = first + i * width
    const range = integers ? `${from}–${from + width - 1}` : `${format(from)}–${format(from + width)}`
    const label = `${range}${suffix}`
    return { key: String(from), label, title: label, caption, members: [] }
  })
  const keys = new Map<DeputyId, string>()
  const missing: DeputyId[] = []
  for (const id of drawn) {
    const value = valueOf(id)
    const bin = value === null ? undefined : bins[Math.floor((value - first) / width)]
    if (bin) {
      bin.members.push(id)
      keys.set(id, bin.key)
    } else missing.push(id)
  }
  const parts: Part[] = missing.length ? [...bins, missingPart(feature.title, missing)] : bins
  return { title: feature.title, parts, keyOf: id => keys.get(id) ?? MISSING }
}

type Bin = Omit<Part, "members"> & { readonly members: DeputyId[] }

function missingPart(title: string, members: readonly DeputyId[]): Part {
  return { key: MISSING, label: NOT_GIVEN, title: NOT_GIVEN, caption: title, members }
}

function membersBy(drawn: readonly DeputyId[], keyOf: (id: DeputyId) => string): ReadonlyMap<string, readonly DeputyId[]> {
  const members = new Map<string, DeputyId[]>()
  for (const id of drawn) {
    const key = keyOf(id)
    const inPart = members.get(key)
    if (inPart) inPart.push(id)
    else members.set(key, [id])
  }
  return members
}

function niceWidth(raw: number): number {
  if (raw <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].find(s => s * magnitude >= raw) ?? 10
  return step * magnitude
}

const binFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })

function format(n: number): string {
  return binFormat.format(n)
}
