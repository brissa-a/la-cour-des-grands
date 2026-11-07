import { constituencyCode, type ConstituencyCode } from "../address/codes.ts"
import { loadCatalog, valuesTablePath, type Catalog } from "./catalog.ts"
import { loadCsv } from "./csv.ts"
import { deputyId, type DeputyId } from "./deputyId.ts"
import { CIVILITIES, INIT_COLUMNS, type Civility, type ConstituencyLabel, type Group, type InitRow, type Person } from "./person.ts"
import { parseSeatRows, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS, SEATS_FILE, seatProblemWarning, type EmptySeat, type Seat } from "./seats.ts"
import { photoUrl } from "./snapshotPath.ts"
import type { ReadText, Snapshot } from "./source.ts"
import { parseViewBox, type ViewBox } from "./viewBox.ts"

export type { Civility, ConstituencyLabel, DeputyId, Group, Person, Seat }

export type Deputy = Person & { seat: Seat }

export type Background = { box: ViewBox; markup: string }

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

export async function loadAssembly({ root, read }: Snapshot): Promise<Assembly> {
  const catalogLoaded = loadCatalog(read)
  const [catalog, groupRows, rows, seatRows, svg] = await Promise.all([
    catalogLoaded,
    catalogLoaded.then(catalog => loadCsv(read, valuesTablePath(catalog, "deputies/init.csv", "group"), GROUP_VALUE_COLUMNS)),
    loadCsv(read, "deputies/init.csv", INIT_COLUMNS),
    loadCsv(read, SEATS_FILE, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS),
    read("seats/hemicycle.svg"),
  ])

  const groups = groupRows.map((r): Group => ({ name: r.value, short: r.short_fr, color: r.color, seatCount: 0 }))
  const groupByName = new Map(groups.map(g => [g.name, g]))
  const people = rows.map((row): Person => {
    const group = groupByName.get(row.group)
    if (!group) throw new Error(`deputies/values/group.csv: no group ${row.group}`)
    const civility = CIVILITIES.find(c => c === row.civility)
    if (!civility) throw new Error(`deputies/init.csv: ${row.deputy_id} has civility ${row.civility}`)
    const photo = photoUrl(root, row.photo)
    if (photo === null && row.photo !== "") console.warn(`deputies/init.csv: ${row.deputy_id} has photo ${row.photo}, not a path in the data version`)
    return { ...row, civility, photo, id: deputyId(row.deputy_id), politicalGroup: group }
  })
  const inOffice = people.filter(p => p.in_office === "yes")

  const { seatOf, emptySeats, problems } = parseSeatRows(seatRows, new Set(inOffice.map(p => p.id)))
  for (const problem of problems) console.warn(seatProblemWarning(problem))

  const deputies: Deputy[] = []
  for (const person of inOffice) {
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
  const box = parseViewBox(root.getAttribute("viewBox") ?? "")
  if (root.nodeName !== "svg" || !box) throw new Error("hemicycle.svg: not an svg with a valid viewBox")
  return { box, markup: root.innerHTML }
}

export async function loadOfficialPages(read: ReadText): Promise<ReadonlyMap<DeputyId, string>> {
  const rows = await loadCsv(read, "deputies/links.csv", ["deputy_id", "official_page"])
  return new Map(rows.map(r => [deputyId(r.deputy_id), r.official_page]))
}

export async function loadCommunes(read: ReadText): Promise<ReadonlyMap<DeputyId, string>> {
  const rows = await loadCsv(read, "deputies/communes.csv", ["deputy_id", "communes"])
  return new Map(rows.map(r => [deputyId(r.deputy_id), r.communes]))
}
