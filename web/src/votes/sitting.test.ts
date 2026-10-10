import assert from "node:assert/strict"
import { test } from "node:test"
import { constituencyCode } from "../address/codes.ts"
import { deputyId } from "../data/deputyId.ts"
import { sittingOn } from "./sitting.ts"

function code(value: string) {
  const parsed = constituencyCode(value)
  assert.ok(parsed)
  return parsed
}

const letard = { id: deputyId("PA227089"), seat: { number: "180", x: 0.1, y: -0.5 } }
const vuibert = { id: deputyId("PA793194"), seat: { number: "400", x: -0.2, y: -0.3 } }
const castiglione = { id: deputyId("PA794554") }
const bazinMalgras = { id: deputyId("PA718884") }
const kervran = { id: deputyId("PA719052") }

const today = {
  byConstituency: new Map([
    [code("59-21"), letard],
    [code("08-1"), vuibert],
  ]),
  emptySeats: [{ number: "590", x: 0, y: -0.9 }],
  people: new Map([letard, vuibert, castiglione, bazinMalgras, kervran].map(p => [p.id, p])),
}

test("a past holder sits at today's seat of their constituency, a seat without holder is empty, and holders whose constituency has no seat today are counted apart", () => {
  const sitting = sittingOn(
    today,
    new Map([
      [code("59-21"), castiglione.id],
      [code("10-2"), bazinMalgras.id],
      [code("18-3"), kervran.id],
    ]),
  )
  assert.deepEqual(
    sitting.deputies.map(d => [d.id, d.seat.number]),
    [[castiglione.id, "180"]],
  )
  assert.deepEqual(
    sitting.emptySeats.map(s => s.number),
    ["590", "400"],
  )
  assert.equal(sitting.unplaced, 2)
})
