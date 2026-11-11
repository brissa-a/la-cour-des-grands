import assert from "node:assert/strict"
import { test } from "node:test"
import { constituencyCode, type ConstituencyCode } from "../address/codes.ts"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import type { InOffice } from "../data/office.ts"
import type { Roster } from "./roster.ts"
import { sittingOn, type PastSitting } from "./sitting.ts"

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
const boccaletti = { id: deputyId("PA796042") }
const delyon = { id: deputyId("PA796046"), seat: null }
const stranger = deputyId("PA000000")

type Holder = { readonly id: DeputyId }

const today = {
  byConstituency: new Map([
    [code("59-21"), letard],
    [code("08-1"), vuibert],
  ]),
  sitting: {
    emptySeats: [
      { number: "590", x: 0, y: -0.9, constituency: null },
      { number: "199", x: 0.4, y: -0.63, constituency: code("10-2") },
      { number: "225", x: 0.64, y: -0.68, constituency: code("59-21") },
    ],
  },
  people: new Map([letard, vuibert, castiglione, bazinMalgras, kervran].map(p => [p.id, p])),
}

const withUnseated = {
  byConstituency: new Map<ConstituencyCode, InOffice<Holder>>([...today.byConstituency, [code("83-7"), delyon]]),
  sitting: { emptySeats: [...today.sitting.emptySeats, { number: "12", x: 0.5625, y: 0, constituency: null }] },
  people: new Map<DeputyId, Holder>([...today.people, [boccaletti.id, boccaletti], [delyon.id, delyon]]),
}

const NONE = { vacant: 0, unseated: 0, unseatedSuccessor: 0 }

function past(roster: Roster, from: typeof withUnseated = today) {
  return sittingOn<Holder>(from, roster) ?? assert.fail("today's room")
}

function placed(sitting: PastSitting<Holder>) {
  return {
    deputies: sitting.deputies.map(d => [d.id, d.seat.number]),
    emptySeats: sitting.emptySeats.map(s => s.number),
    unplaced: sitting.unplaced,
  }
}

test("a past holder sits at today's seat of their constituency and a seat without holder that day is empty", () => {
  const sitting = past(new Map([[code("59-21"), castiglione.id]]))
  assert.deepEqual(placed(sitting), {
    deputies: [[castiglione.id, "180"]],
    emptySeats: ["590", "199", "225", "400"],
    unplaced: NONE,
  })
  assert.equal(sitting.byId.get(castiglione.id)?.seat.number, "180")
})

test("a deputy who held their constituency on that date stays today's very object, so their memoised dot does not re-render", () => {
  const sitting = past(new Map([[code("08-1"), vuibert.id]]))
  assert.equal(sitting.deputies[0], vuibert)
})

test("the past holder of a constituency vacant today sits on the empty seat the seat file gives it, which is no longer empty", () => {
  const sitting = past(new Map([[code("10-2"), bazinMalgras.id]]))
  assert.deepEqual(placed(sitting), {
    deputies: [[bazinMalgras.id, "199"]],
    emptySeats: ["590", "225", "180", "400"],
    unplaced: NONE,
  })
})

test("only the past holders of constituencies vacant today that no empty seat bears are counted apart", () => {
  const sitting = past(
    new Map([
      [code("10-2"), bazinMalgras.id],
      [code("18-3"), kervran.id],
      [code("33-11"), castiglione.id],
    ]),
  )
  assert.deepEqual(placed(sitting).deputies, [[bazinMalgras.id, "199"]])
  assert.deepEqual(sitting.unplaced, { ...NONE, vacant: 2 })
})

test("an empty seat that the seat file gives to a constituency held today stays empty, so its past holder is drawn once", () => {
  const sitting = past(new Map([[code("59-21"), castiglione.id]]))
  assert.deepEqual(placed(sitting).deputies, [[castiglione.id, "180"]])
  assert.ok(placed(sitting).emptySeats.includes("225"))
})

test("a holder missing from the people is not drawn and leaves the seat empty, whether the constituency is held or vacant today", () => {
  const sitting = past(
    new Map([
      [code("59-21"), stranger],
      [code("10-2"), stranger],
    ]),
  )
  assert.deepEqual(placed(sitting), {
    deputies: [],
    emptySeats: ["590", "199", "225", "180", "400"],
    unplaced: NONE,
  })
})

test("a roster giving every constituency today's deputy is today's room, while one vacancy, one other holder or one past holder of a constituency vacant today and of no known seat is a past room", () => {
  const todays = new Map([
    [code("59-21"), letard.id],
    [code("08-1"), vuibert.id],
  ])
  assert.equal(sittingOn(today, todays), null)
  assert.ok(sittingOn(today, new Map([[code("08-1"), vuibert.id]])))
  assert.ok(sittingOn(today, new Map([...todays, [code("08-1"), kervran.id]])))
  assert.ok(sittingOn(today, new Map([...todays, [code("10-2"), bazinMalgras.id]])))
  assert.equal(sittingOn(today, new Map([...todays, [code("18-3"), kervran.id]]))?.unplaced.vacant, 1)
})

test("a deputy in office without a seat is not drawn in the votes she sat in and is counted apart from a vacancy, so a room of today's deputies is still told apart", () => {
  const sitting = past(
    new Map([
      [code("59-21"), letard.id],
      [code("08-1"), vuibert.id],
      [code("83-7"), delyon.id],
    ]),
    withUnseated,
  )
  assert.deepEqual(placed(sitting), {
    deputies: [
      [letard.id, "180"],
      [vuibert.id, "400"],
    ],
    emptySeats: ["590", "199", "225", "12"],
    unplaced: { ...NONE, unseated: 1 },
  })
})

test("the predecessor of a deputy without a seat is not drawn in his votes, counted apart as waiting for his successor's seat, and the seats stay empty", () => {
  assert.deepEqual(placed(past(new Map([[code("83-7"), boccaletti.id]]), withUnseated)), {
    deputies: [],
    emptySeats: ["590", "199", "225", "12", "180", "400"],
    unplaced: { ...NONE, unseatedSuccessor: 1 },
  })
})

test("a vote day when nobody held the constituency of today's deputy without a seat counts no one apart for it", () => {
  const todays = new Map([
    [code("59-21"), letard.id],
    [code("08-1"), vuibert.id],
  ])
  assert.equal(sittingOn<Holder>(withUnseated, todays), null)
})
