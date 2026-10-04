import { loadCatalog, valuesTablePath, type Catalog } from "./catalog.ts"
import { loadCsv, type Row } from "./csv.ts"
import { fetchText } from "./source.ts"

const INIT_COLUMNS = [
  "deputy_id", "photo", "last_name", "first_name", "civility", "birth_date", "age", "in_office",
  "constituency", "department", "department_number", "constituency_number", "group",
] as const

const SEAT_COLUMNS = ["seat", "x", "y", "deputy"] as const

export type DeputyId = string & { readonly __brand: "DeputyId" }

export type Seat = { number: string; x: number; y: number }

type InitRow = Row<(typeof INIT_COLUMNS)[number]>

export type Deputy = InitRow & { id: DeputyId; seat: Seat; politicalGroup: Group }

export type Group = { name: string; short: string; color: string; seatCount: number }

export type Background = { viewBox: string; markup: string }

export type Assembly = {
  catalog: Catalog
  initRows: ReadonlyMap<DeputyId, Readonly<Record<string, string>>>
  deputies: Deputy[]
  byId: ReadonlyMap<DeputyId, Deputy>
  groups: Group[]
  emptySeats: Seat[]
  background: Background
}

const GROUP_VALUE_COLUMNS = ["value", "label_fr", "short_fr", "color"] as const

export async function loadAssembly(): Promise<Assembly> {
  const catalogLoaded = loadCatalog()
  const [catalog, groupRows, rows, seatRows, svg] = await Promise.all([
    catalogLoaded,
    catalogLoaded.then(catalog => loadCsv(valuesTablePath(catalog, "deputies/init.csv", "group"), GROUP_VALUE_COLUMNS)),
    loadCsv("deputies/init.csv", INIT_COLUMNS),
    loadCsv("seats/hemicycle.csv", SEAT_COLUMNS),
    fetchText("seats/hemicycle.svg"),
  ])

  const seatOf = new Map<string, Seat>()
  const emptySeats: Seat[] = []
  for (const r of seatRows) {
    const seat = { number: r.seat, x: Number(r.x), y: Number(r.y) }
    if (r.deputy) seatOf.set(r.deputy, seat)
    else emptySeats.push(seat)
  }
  const seated: { row: InitRow; seat: Seat }[] = []
  for (const row of rows) {
    if (row.in_office !== "yes") continue
    const seat = seatOf.get(row.deputy_id)
    if (seat) seated.push({ row, seat })
    else console.warn(`${row.deputy_id} is in office but has no seat in seats/hemicycle.csv`)
  }

  const groups = groupRows.map((r): Group => ({ name: r.value, short: r.short_fr, color: r.color, seatCount: 0 }))
  const groupByName = new Map(groups.map(g => [g.name, g]))
  const deputies = seated.map(({ row, seat }): Deputy => {
    const group = groupByName.get(row.group)
    if (!group) throw new Error(`deputies/values/group.csv: no group ${row.group}`)
    group.seatCount++
    return { ...row, id: row.deputy_id as DeputyId, seat, politicalGroup: group }
  })

  return {
    catalog,
    initRows: new Map(rows.map(r => [r.deputy_id as DeputyId, r])),
    deputies,
    byId: new Map(deputies.map(d => [d.id, d])),
    groups: groups.filter(g => g.seatCount > 0),
    emptySeats,
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
