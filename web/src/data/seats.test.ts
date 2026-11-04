import assert from "node:assert/strict"
import { test } from "node:test"
import { parseCsv } from "./csvRows.ts"
import { deputyId } from "./deputyId.ts"
import { parseSeatRows, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS, SEATS_FILE, seatProblemWarning } from "./seats.ts"

const row = (seat: string, deputy: string, constituency: string) => ({ seat, x: "0.4004", y: "-0.6342", deputy, constituency })

const at = (number: string) => ({ number, x: 0.4004, y: -0.6342 })

const inOffice = new Set([deputyId("PA794954"), deputyId("PA842097")])

function read(rows: Parameters<typeof parseSeatRows>[0]) {
  const { seatOf, emptySeats, problems } = parseSeatRows(rows, inOffice)
  return { seatOf: [...seatOf], emptySeats, warnings: problems.map(seatProblemWarning) }
}

test("a seat with a deputy is that deputy's seat, and an empty seat keeps the constituency of its cell or none when the cell is empty", () => {
  assert.deepEqual(read([row("1", "PA794954", "70-2"), row("199", "", "10-2"), row("124", "", ""), { ...row("7", "", ""), x: "-0.5", y: "1e-1" }]), {
    seatOf: [[deputyId("PA794954"), at("1")]],
    emptySeats: [
      { ...at("199"), constituency: "10-2" },
      { ...at("124"), constituency: null },
      { number: "7", x: -0.5, y: 0.1, constituency: null },
    ],
    warnings: [],
  })
})

test("a seat whose x or y is empty or not a number is dropped with a warning naming it and the axis, and frees its deputy and constituency for a later seat", () => {
  assert.deepEqual(read([{ ...row("7", "PA794954", "10-2"), x: "abc" }, { ...row("8", "", ""), y: " " }, row("9", "PA794954", ""), row("10", "", "10-2")]), {
    seatOf: [[deputyId("PA794954"), at("9")]],
    emptySeats: [{ ...at("10"), constituency: "10-2" }],
    warnings: ['seats/hemicycle.csv: seat 7 dropped, its x is "abc"', 'seats/hemicycle.csv: seat 8 dropped, its y is " "'],
  })
})

test("a seat whose deputy cell is not an in-office deputy, unknown or blank, is dropped with a warning quoting the cell, and frees its constituency for a later seat", () => {
  assert.deepEqual(read([row("1", "PA000001", "10-2"), row("2", " ", "70-2"), row("3", "PA842097", "70-2"), row("4", "", "10-2")]), {
    seatOf: [[deputyId("PA842097"), at("3")]],
    emptySeats: [{ ...at("4"), constituency: "10-2" }],
    warnings: [
      'seats/hemicycle.csv: seat 1 dropped, its deputy "PA000001" is not in office in deputies/init.csv',
      'seats/hemicycle.csv: seat 2 dropped, its deputy " " is not in office in deputies/init.csv',
    ],
  })
})

test("a deputy on a second seat keeps the first, and the second is dropped with a warning naming both seats, its constituency left free", () => {
  assert.deepEqual(read([row("1", "PA794954", "70-2"), row("2", "PA794954", "10-2"), row("3", "", "10-2")]), {
    seatOf: [[deputyId("PA794954"), at("1")]],
    emptySeats: [{ ...at("3"), constituency: "10-2" }],
    warnings: ["seats/hemicycle.csv: seat 2 dropped, deputy PA794954 is already on seat 1"],
  })
})

test("a malformed constituency cell, on an empty seat as on a held one, leaves the seat drawn without a constituency and warns naming the seat", () => {
  assert.deepEqual(read([row("199", "", "10"), row("1", "PA794954", "70-")]), {
    seatOf: [[deputyId("PA794954"), at("1")]],
    emptySeats: [{ ...at("199"), constituency: null }],
    warnings: [
      'seats/hemicycle.csv: seat 199 kept without its constituency "10", which is not a constituency code',
      'seats/hemicycle.csv: seat 1 kept without its constituency "70-", which is not a constituency code',
    ],
  })
})

test("a constituency on a second seat stays on the first, held or empty, and the second seat is drawn without it with a warning naming both seats", () => {
  assert.deepEqual(read([row("1", "PA794954", "10-2"), row("3", "", "10-2"), row("4", "", "70-2"), row("5", "", "70-2")]), {
    seatOf: [[deputyId("PA794954"), at("1")]],
    emptySeats: [
      { ...at("3"), constituency: null },
      { ...at("4"), constituency: "70-2" },
      { ...at("5"), constituency: null },
    ],
    warnings: [
      "seats/hemicycle.csv: seat 3 kept without its constituency 10-2, which is already on seat 1",
      "seats/hemicycle.csv: seat 5 kept without its constituency 70-2, which is already on seat 4",
    ],
  })
})

test("a seat file without a constituency column draws every seat with no constituency, while one without seat, x, y or deputy is refused", () => {
  const rows = parseCsv(SEATS_FILE, "seat,x,y,deputy\n1,0.4004,-0.6342,PA794954\n199,0.4004,-0.6342,\n", SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS)
  assert.deepEqual(read(rows), { seatOf: [[deputyId("PA794954"), at("1")]], emptySeats: [{ ...at("199"), constituency: null }], warnings: [] })
  for (const column of ["seat", "x", "y", "deputy"]) {
    const header = ["seat", "x", "y", "deputy", "constituency"].filter(c => c !== column).join(",")
    assert.throws(() => parseCsv(SEATS_FILE, `${header}\n`, SEAT_COLUMNS, SEAT_OPTIONAL_COLUMNS), { message: `seats/hemicycle.csv: missing columns ${column}` })
  }
})
