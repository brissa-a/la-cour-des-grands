import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import { shownSeat } from "./seat.ts"

const seat12 = { number: "12", x: 0.5625, y: 0 }
const seat180 = { number: "180", x: 0.1, y: -0.5 }
const boccaletti = deputyId("PA796042")
const delyon = deputyId("PA796046")
const letard = deputyId("PA227089")
const castiglione = deputyId("PA794554")

const inOffice = new Map([
  [letard, { seat: seat180 }],
  [delyon, { seat: null }],
])

// @ts-expect-error the deputies in office, some without a seat, taken for those the view draws
export const unseatedDrawn = shownSeat(delyon, inOffice, inOffice)

test("a fiche gives the seat drawn in the view, else today's seat, else that a deputy in office has none yet, else no seat", () => {
  const drawn = new Map([[boccaletti, { seat: seat12 }]])
  assert.equal(shownSeat(boccaletti, drawn, inOffice), seat12)
  assert.equal(shownSeat(letard, drawn, inOffice), seat180)
  assert.equal(shownSeat(delyon, drawn, inOffice), "unassigned")
  assert.equal(shownSeat(castiglione, drawn, inOffice), null)
})
