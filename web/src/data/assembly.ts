import { findFeature, loadCatalog } from "./catalog.ts"
import { loadCsv, type Row } from "./csv.ts"
import { fetchText } from "./source.ts"

const INIT_COLUMNS = [
  "deputy_id", "photo", "last_name", "first_name", "civility", "birth_date", "age", "in_office",
  "constituency", "department", "department_number", "constituency_number", "group", "group_short",
] as const

const SEAT_COLUMNS = ["constituency", "seat", "x", "y"] as const

export type DeputyId = string & { readonly __brand: "DeputyId" }

export type Seat = { number: string; x: number; y: number }

type InitRow = Row<(typeof INIT_COLUMNS)[number]>

export type Deputy = InitRow & { id: DeputyId; seat: Seat; politicalGroup: Group }

export type Group = { name: string; short: string; color: string; seatCount: number }

export type Background = { viewBox: string; markup: string }

export type Assembly = {
  deputies: Deputy[]
  byId: ReadonlyMap<DeputyId, Deputy>
  groups: Group[]
  background: Background
}

const FALLBACK_COLOR = "#8D949A"

export async function loadAssembly(): Promise<Assembly> {
  const [catalog, rows, seatRows, svg] = await Promise.all([
    loadCatalog(),
    loadCsv("deputies/init.csv", INIT_COLUMNS),
    loadCsv("constituencies/hemicycle.csv", SEAT_COLUMNS),
    fetchText("constituencies/hemicycle.svg"),
  ])

  const seats = new Map(seatRows.map(r => [r.constituency, { number: r.seat, x: Number(r.x), y: Number(r.y) }]))
  const seated: { row: InitRow; seat: Seat }[] = []
  for (const row of rows) {
    if (row.in_office !== "yes") continue
    const seat = seats.get(row.constituency)
    if (seat) seated.push({ row, seat })
    else console.warn(`${row.deputy_id} is in office but ${row.constituency} has no seat in hemicycle.csv`)
  }

  const groupFeature = findFeature(catalog, "deputies/init.csv", "group")
  const colors = groupFeature.type === "category" ? (groupFeature.colors ?? {}) : {}
  const groups = new Map<string, Group & { xSum: number }>()
  const deputies = seated.map(({ row, seat }): Deputy => {
    let group = groups.get(row.group)
    if (!group) {
      group = { name: row.group, short: row.group_short, color: colors[row.group] ?? FALLBACK_COLOR, seatCount: 0, xSum: 0 }
      groups.set(row.group, group)
    }
    group.seatCount++
    group.xSum += seat.x
    return { ...row, id: row.deputy_id as DeputyId, seat, politicalGroup: group }
  })

  return {
    deputies,
    byId: new Map(deputies.map(d => [d.id, d])),
    groups: [...groups.values()].sort((a, b) => a.xSum / a.seatCount - b.xSum / b.seatCount),
    background: parseBackground(svg),
  }
}

function parseBackground(svg: string): Background {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement
  const viewBox = root.getAttribute("viewBox")
  if (root.nodeName !== "svg" || !viewBox) throw new Error("hemicycle.svg: not an svg with a viewBox")
  return { viewBox, markup: root.innerHTML }
}

export async function loadOfficialPages(): Promise<ReadonlyMap<DeputyId, string>> {
  const rows = await loadCsv("deputies/links.csv", ["deputy_id", "official_page"])
  return new Map(rows.map(r => [r.deputy_id as DeputyId, r.official_page]))
}

export async function loadCommunes(): Promise<ReadonlyMap<DeputyId, string>> {
  const rows = await loadCsv("deputies/communes.csv", ["deputy_id", "communes"])
  return new Map(rows.map(r => [r.deputy_id as DeputyId, r.communes]))
}
