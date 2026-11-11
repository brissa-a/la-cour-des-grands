import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import { seatFact, shownSeat, type ShownSeat } from "./seat.ts"

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
export const unseatedDrawn = shownSeat(delyon, { byId: inOffice, deputies: [] }, inOffice)

export const undrawnCounted: readonly Extract<ShownSeat, { readonly among: number }>["kind"][] = [
  // @ts-expect-error a fiche counting among the deputies the view draws one it shows at today's seat
  "today",
  // @ts-expect-error a fiche counting among the deputies the view draws one whose seat is not attributed yet
  "unassigned",
  // @ts-expect-error a fiche counting among the deputies the view draws one with no seat
  "none",
]

test("a fiche gives the seat drawn in the view among how many the view draws, else today's seat, else that a deputy in office has none yet, else no seat", () => {
  const drawn = { byId: new Map([[boccaletti, { seat: seat12 }]]), deputies: [boccaletti, letard, castiglione] }
  assert.deepEqual(shownSeat(boccaletti, drawn, inOffice), { kind: "drawn", seat: seat12, among: 3 })
  assert.deepEqual(shownSeat(letard, drawn, inOffice), { kind: "today", seat: seat180 })
  assert.deepEqual(shownSeat(delyon, drawn, inOffice), { kind: "unassigned" })
  assert.deepEqual(shownSeat(castiglione, drawn, inOffice), { kind: "none" })
})

test("a fiche's seat line gives the seat's number, drawn or today's, says a deputy in office has none yet, and is left out without a seat", () => {
  assert.deepEqual(
    [
      seatFact({ kind: "drawn", seat: seat12, among: 3 }),
      seatFact({ kind: "today", seat: seat180 }),
      seatFact({ kind: "unassigned" }),
      seatFact({ kind: "none" }),
    ],
    ["n° 12", "n° 180", "Pas encore attribué", null],
  )
})
