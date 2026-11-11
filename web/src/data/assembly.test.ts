import assert from "node:assert/strict"
import { test } from "node:test"
import { constituencyCode } from "../address/codes.ts"
import { deputiesOf, type AssemblyTables } from "./assembly.ts"
import { deputyId } from "./deputyId.ts"
import type { InitRow } from "./person.ts"

const ROOT = "/data/v2/d14b3767011d709e9565eeab3af97ca1ad57650a/"

const LECAMP = deputyId("PA794954")
const DELYON = deputyId("PA796046")
const BOCCALETTI = deputyId("PA796042")
const UNPLACED = deputyId("PA000001")

function row(deputy_id: string, cells: Partial<InitRow>): InitRow {
  return {
    deputy_id,
    photo: "",
    last_name: "",
    first_name: "",
    civility: "Mme",
    birth_date: "1970-01-01",
    age: "56",
    in_office: "yes",
    constituency: "",
    department: "",
    department_number: "",
    constituency_number: "",
    mandate_periods: "2024-07-08/",
    group: "LIOT",
    ...cells,
  }
}

const TABLES: AssemblyTables = {
  groupRows: [
    { value: "LIOT", label_fr: "Libertés, indépendants, outre-mer et territoires", short_fr: "LIOT", color: "#e2b100" },
    { value: "RN", label_fr: "Rassemblement national", short_fr: "RN", color: "#0d378a" },
  ],
  rows: [
    row(LECAMP, { civility: "M.", photo: "photos/PA794954.webp", constituency: "70-2", department: "Haute-Saône", department_number: "70", constituency_number: "2" }),
    row(DELYON, { photo: "../PA796046.webp", constituency: "83-7", department: "Var", department_number: "83", constituency_number: "7", group: "RN" }),
    row(BOCCALETTI, { civility: "M.", in_office: "no", constituency: "83-7", department: "Var", department_number: "83", constituency_number: "7", group: "RN" }),
    row(UNPLACED, { in_office: "no", department: "Var" }),
  ],
  seatRows: [
    { seat: "1", x: "0.375", y: "0", deputy: LECAMP, constituency: "70-2" },
    { seat: "12", x: "0.5625", y: "0", deputy: "", constituency: "08-1" },
    { seat: "13", x: "0.6", y: "0", deputy: BOCCALETTI, constituency: "" },
  ],
}

test("the deputies read from the tables keep in office one the seat file leaves without a seat, found by id and constituency but not among those the room draws, and those out of office as people only", t => {
  const warn = t.mock.method(console, "warn", () => undefined)
  const assembly = deputiesOf(ROOT, TABLES)
  const seat = { number: "1", x: 0.375, y: 0 }
  assert.deepEqual(
    assembly.deputies.map(deputy => [deputy.id, deputy.seat]),
    [
      [LECAMP, seat],
      [DELYON, null],
    ],
  )
  assert.deepEqual([...assembly.byId.keys()], [LECAMP, DELYON])
  assert.deepEqual([...assembly.byConstituency].map(([code, deputy]) => [code, deputy.id]), [
    ["70-2", LECAMP],
    ["83-7", DELYON],
  ])
  assert.deepEqual(
    assembly.sitting.deputies.map(deputy => [deputy.id, deputy.seat]),
    [[LECAMP, seat]],
  )
  assert.deepEqual([...assembly.sitting.byId.keys()], [LECAMP])
  assert.deepEqual(assembly.sitting.emptySeats, [{ number: "12", x: 0.5625, y: 0, constituency: "08-1" }])
  assert.deepEqual([...assembly.people.keys()], [LECAMP, DELYON, BOCCALETTI, UNPLACED])
  assert.deepEqual([...assembly.initRows.keys()], [LECAMP, DELYON, BOCCALETTI, UNPLACED])
  assert.equal(assembly.initRows.get(BOCCALETTI), TABLES.rows[2])
  const lecamp = assembly.people.get(LECAMP)
  assert.deepEqual([lecamp?.id, lecamp?.civility, lecamp?.photo, lecamp?.politicalGroup], [LECAMP, "M.", `${ROOT}photos/PA794954.webp`, { name: "LIOT", short: "LIOT", color: "#e2b100" }])
  assert.deepEqual([assembly.people.get(DELYON)?.photo, assembly.people.get(BOCCALETTI)?.photo], [null, null])
  assert.deepEqual(assembly.byId.get(DELYON)?.politicalGroup, { name: "RN", short: "RN", color: "#0d378a" })
  assert.deepEqual([...assembly.constituencyLabels.keys()], ["70-2", "83-7"])
  assert.deepEqual(assembly.constituencyLabels.get(constituencyCode("83-7") ?? assert.fail()), { department: "Var", department_number: "83", constituency_number: "7" })
  assert.deepEqual(
    warn.mock.calls.map(call => call.arguments),
    [
      ["deputies/init.csv: PA796046 has photo ../PA796046.webp, not a path in the data version"],
      [`seats/hemicycle.csv: seat 13 dropped, its deputy "${BOCCALETTI}" is not in office in deputies/init.csv`],
    ],
  )
})

test("a deputy whose group the group table does not list, or whose civility is neither M. nor Mme, fails the read naming them", () => {
  const unlisted = { ...TABLES, rows: [row(LECAMP, { group: "UDR" })] }
  assert.throws(() => deputiesOf(ROOT, unlisted), { message: "deputies/values/group.csv: no group UDR" })
  const civility = { ...TABLES, rows: [row(LECAMP, { civility: "Mlle" })] }
  assert.throws(() => deputiesOf(ROOT, civility), { message: "deputies/init.csv: PA794954 has civility Mlle" })
})
