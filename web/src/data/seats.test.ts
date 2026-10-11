import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "./deputyId.ts"
import { parseSeatRows } from "./seats.ts"

const row = (seat: string, deputy: string, constituency: string) => ({ seat, x: "0.4004", y: "-0.6342", deputy, constituency })

test("a seat with a deputy is that deputy's seat, and an empty seat keeps the constituency of its cell or none when the cell is empty", () => {
  const { seatOf, emptySeats } = parseSeatRows([row("1", "PA794954", "70-2"), row("199", "", "10-2"), row("124", "", "")])
  assert.deepEqual([...seatOf], [[deputyId("PA794954"), { number: "1", x: 0.4004, y: -0.6342 }]])
  assert.deepEqual(emptySeats, [
    { number: "199", x: 0.4004, y: -0.6342, constituency: "10-2" },
    { number: "124", x: 0.4004, y: -0.6342, constituency: null },
  ])
})

test("a malformed constituency cell is rejected naming its file and seat, on an empty seat as on a held one, rather than read as no constituency", () => {
  assert.throws(() => parseSeatRows([row("199", "", "10")]), /seats\/hemicycle\.csv: seat 199 has constituency "10"/)
  assert.throws(() => parseSeatRows([row("1", "PA794954", "70-")]), /seats\/hemicycle\.csv: seat 1 has constituency "70-"/)
})

test("an empty or non-numeric coordinate is rejected naming its file, seat and axis, rather than read as 0 or NaN", () => {
  assert.throws(() => parseSeatRows([{ ...row("7", "", ""), x: "abc" }]), /seats\/hemicycle\.csv: seat 7 has x "abc"/)
  assert.throws(() => parseSeatRows([{ ...row("7", "", ""), y: " " }]), /seats\/hemicycle\.csv: seat 7 has y " "/)
  assert.deepEqual(parseSeatRows([{ ...row("7", "", ""), x: "-0.5", y: "1e-1" }]).emptySeats, [{ number: "7", x: -0.5, y: 0.1, constituency: null }])
})

test("a deputy or a constituency on two seats is rejected naming both seats, rather than one of the seats silently dropped", () => {
  assert.throws(() => parseSeatRows([row("1", "PA794954", ""), row("2", "PA794954", "")]), /seats\/hemicycle\.csv: deputy PA794954 is on seats 1 and 2/)
  assert.throws(() => parseSeatRows([row("2", "", "10-2"), row("3", "", "10-2")]), /seats\/hemicycle\.csv: constituency 10-2 is on seats 2 and 3/)
  assert.throws(() => parseSeatRows([row("1", "PA794954", "10-2"), row("3", "", "10-2")]), /constituency 10-2 is on seats 1 and 3/)
})
