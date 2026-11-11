import { constituencyCode, type ConstituencyCode } from "../address/codes.ts"
import { loadCatalog, valuesTablePath, type Catalog } from "./catalog.ts"
import { loadCsv, type Row } from "./csv.ts"
import { deputyId, type DeputyId } from "./deputyId.ts"
import { officeOf, type InOffice, type Office, type Seated, type Sitting as SittingOf } from "./office.ts"
import { CIVILITIES, INIT_COLUMNS, type Civility, type ConstituencyLabel, type Group, type InitRow, type Person } from "./person.ts"
import { parseSeatRows, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS, SEATS_FILE, seatProblemWarning, type Seat, type SeatRow } from "./seats.ts"
import { photoUrl } from "./snapshotPath.ts"
import type { ReadText, Snapshot } from "./source.ts"
import { parseViewBox, type ViewBox } from "./viewBox.ts"

export type { Civility, ConstituencyLabel, DeputyId, Group, Person, Seat }

export type Deputy = InOffice<Person>

export type SeatedDeputy = Seated<Person>

export type Sitting = SittingOf<Person>

export type Background = { box: ViewBox; markup: string }

export type Assembly = Office<Person> & {
  catalog: Catalog
  initRows: ReadonlyMap<DeputyId, Readonly<Record<string, string>>>
  people: ReadonlyMap<DeputyId, Person>
  constituencyLabels: ReadonlyMap<ConstituencyCode, ConstituencyLabel>
  background: Background
}

const GROUP_VALUE_COLUMNS = ["value", "label_fr", "short_fr", "color"] as const

export type AssemblyTables = {
  readonly groupRows: readonly Row<(typeof GROUP_VALUE_COLUMNS)[number]>[]
  readonly rows: readonly InitRow[]
  readonly seatRows: readonly SeatRow[]
}

export async function loadAssembly({ root, read }: Snapshot): Promise<Assembly> {
  const catalogLoaded = loadCatalog(read)
  const [catalog, groupRows, rows, seatRows, svg] = await Promise.all([
    catalogLoaded,
    catalogLoaded.then(catalog => loadCsv(read, valuesTablePath(catalog, "deputies/init.csv", "group"), GROUP_VALUE_COLUMNS)),
    loadCsv(read, "deputies/init.csv", INIT_COLUMNS),
    loadCsv(read, SEATS_FILE, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS),
    read("seats/hemicycle.svg"),
  ])
  return { ...deputiesOf(root, { groupRows, rows, seatRows }), catalog, background: parseBackground(svg) }
}

export function deputiesOf(root: string, { groupRows, rows, seatRows }: AssemblyTables): Omit<Assembly, "catalog" | "background"> {
  const groupByName = new Map(groupRows.map((r): [string, Group] => [r.value, { name: r.value, short: r.short_fr, color: r.color }]))
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

  const plan = parseSeatRows(seatRows, new Set(inOffice.map(p => p.id)))
  for (const problem of plan.problems) console.warn(seatProblemWarning(problem))

  return {
    ...officeOf(inOffice, plan),
    initRows: new Map(rows.map(r => [deputyId(r.deputy_id), r])),
    people: new Map(people.map(p => [p.id, p])),
    constituencyLabels: constituencyLabels(rows),
  }
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
