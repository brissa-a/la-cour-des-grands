import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "./deputyId.ts"
import { readSeats } from "./seats.ts"

const row = (seat: string, deputy: string, constituency: string) => ({ seat, x: "0.4004", y: "-0.6342", deputy, constituency })

test("a seat with a deputy is that deputy's seat, and an empty seat keeps the constituency of its cell or none when the cell is empty", () => {
  const { seatOf, emptySeats } = readSeats([row("1", "PA794954", "70-2"), row("199", "", "10-2"), row("124", "", "")])
  assert.deepEqual([...seatOf], [[deputyId("PA794954"), { number: "1", x: 0.4004, y: -0.6342 }]])
  assert.deepEqual(emptySeats, [
    { number: "199", x: 0.4004, y: -0.6342, constituency: "10-2" },
    { number: "124", x: 0.4004, y: -0.6342, constituency: null },
  ])
})

test("a malformed constituency cell is rejected naming its file and seat, on an empty seat as on a held one, rather than read as no constituency", () => {
  assert.throws(() => readSeats([row("199", "", "10")]), /seats\/hemicycle\.csv: seat 199 has constituency "10"/)
  assert.throws(() => readSeats([row("1", "PA794954", "70-")]), /seats\/hemicycle\.csv: seat 1 has constituency "70-"/)
})
