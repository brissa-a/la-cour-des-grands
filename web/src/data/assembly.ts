import { constituencyCode, type ConstituencyCode } from "../address/codes.ts"
import { loadCatalog, valuesTablePath, type Catalog } from "./catalog.ts"
import { loadCsv, type Row } from "./csv.ts"
import { deputyId, type DeputyId } from "./deputyId.ts"
import { readSeats, SEAT_COLUMNS, SEATS_FILE, type EmptySeat, type Seat } from "./seats.ts"
import { fetchText } from "./source.ts"

export type { DeputyId, Seat }

const INIT_COLUMNS = [
  "deputy_id", "photo", "last_name", "first_name", "civility", "birth_date", "age", "in_office",
  "constituency", "department", "department_number", "constituency_number", "mandate_periods", "group",
] as const

type InitRow = Row<(typeof INIT_COLUMNS)[number]>

const CIVILITIES = ["M.", "Mme"] as const

export type Civility = (typeof CIVILITIES)[number]

export type Person = Omit<InitRow, "civility"> & { civility: Civility; id: DeputyId; politicalGroup: Group }

export type Deputy = Person & { seat: Seat }

export type ConstituencyLabel = Pick<InitRow, "department" | "department_number" | "constituency_number">

export type Group = { name: string; short: string; color: string; seatCount: number }

export type Background = { viewBox: string; markup: string }

export type Sitting = {
  deputies: readonly Deputy[]
  byId: ReadonlyMap<DeputyId, Deputy>
  emptySeats: readonly Seat[]
}

export type Assembly = Omit<Sitting, "emptySeats"> & {
  emptySeats: readonly EmptySeat[]
  catalog: Catalog
  initRows: ReadonlyMap<DeputyId, Readonly<Record<string, string>>>
  people: ReadonlyMap<DeputyId, Person>
  byConstituency: ReadonlyMap<ConstituencyCode, Deputy>
  constituencyLabels: ReadonlyMap<ConstituencyCode, ConstituencyLabel>
  groups: Group[]
  background: Background
}

const GROUP_VALUE_COLUMNS = ["value", "label_fr", "short_fr", "color"] as const

export async function loadAssembly(): Promise<Assembly> {
  const catalogLoaded = loadCatalog()
  const [catalog, groupRows, rows, seatRows, svg] = await Promise.all([
    catalogLoaded,
    catalogLoaded.then(catalog => loadCsv(valuesTablePath(catalog, "deputies/init.csv", "group"), GROUP_VALUE_COLUMNS)),
    loadCsv("deputies/init.csv", INIT_COLUMNS),
    loadCsv(SEATS_FILE, SEAT_COLUMNS),
    fetchText("seats/hemicycle.svg"),
  ])

  const { seatOf, emptySeats } = readSeats(seatRows)
  const groups = groupRows.map((r): Group => ({ name: r.value, short: r.short_fr, color: r.color, seatCount: 0 }))
  const groupByName = new Map(groups.map(g => [g.name, g]))
  const people = rows.map((row): Person => {
    const group = groupByName.get(row.group)
    if (!group) throw new Error(`deputies/values/group.csv: no group ${row.group}`)
    const civility = CIVILITIES.find(c => c === row.civility)
    if (!civility) throw new Error(`deputies/init.csv: ${row.deputy_id} has civility ${row.civility}`)
    return { ...row, civility, id: deputyId(row.deputy_id), politicalGroup: group }
  })

  const deputies: Deputy[] = []
  for (const person of people) {
    if (person.in_office !== "yes") continue
    const seat = seatOf.get(person.id)
    if (!seat) {
      console.warn(`${person.id} is in office but has no seat in ${SEATS_FILE}`)
      continue
    }
    person.politicalGroup.seatCount++
    deputies.push({ ...person, seat })
  }

  return {
    catalog,
    initRows: new Map(rows.map(r => [deputyId(r.deputy_id), r])),
    people: new Map(people.map(p => [p.id, p])),
    deputies,
    byId: new Map(deputies.map(d => [d.id, d])),
    byConstituency: byConstituency(deputies),
    constituencyLabels: constituencyLabels(rows),
    groups: groups.filter(g => g.seatCount > 0),
    emptySeats,
    background: parseBackground(svg),
  }
}

function byConstituency(deputies: readonly Deputy[]): ReadonlyMap<ConstituencyCode, Deputy> {
  const map = new Map<ConstituencyCode, Deputy>()
  for (const deputy of deputies) {
    const code = constituencyCode(deputy.constituency)
    if (code === null) {
      console.warn(`deputies/init.csv: ${deputy.id} has constituency ${deputy.constituency}`)
      continue
    }
    const holder = map.get(code)
    if (holder) console.warn(`deputies/init.csv: ${holder.id} and ${deputy.id} both hold ${code}`)
    else map.set(code, deputy)
  }
  return map
}

function constituencyLabels(rows: readonly InitRow[]): ReadonlyMap<ConstituencyCode, ConstituencyLabel> {
  const labels = new Map<ConstituencyCode, ConstituencyLabel>()
  for (const { constituency, department, department_number, constituency_number } of rows) {
    const code = constituencyCode(constituency)
    if (code) labels.set(code, { department, department_number, constituency_number })
  }
  return labels
}

function parseBackground(svg: string): Background {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement
  const viewBox = root.getAttribute("viewBox")
  if (root.nodeName !== "svg" || !viewBox) throw new Error("hemicycle.svg: not an svg with a viewBox")
  return { viewBox, markup: root.innerHTML }
}

export async function loadOfficialPages(): Promise<ReadonlyMap<DeputyId, string>> {
  const rows = await loadCsv("deputies/links.csv", ["deputy_id", "official_page"])
  return new Map(rows.map(r => [deputyId(r.deputy_id), r.official_page]))
}

export async function loadCommunes(): Promise<ReadonlyMap<DeputyId, string>> {
  const rows = await loadCsv("deputies/communes.csv", ["deputy_id", "communes"])
  return new Map(rows.map(r => [deputyId(r.deputy_id), r.communes]))
}
