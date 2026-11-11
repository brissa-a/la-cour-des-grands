import assert from "node:assert/strict"
import type { ComponentProps } from "react"
import { test } from "node:test"
import { constituencyCode } from "../address/codes.ts"
import type { Stage } from "../layout/Stage.tsx"
import type { seatsOf } from "../sources/seats.ts"
import type { Deputy } from "./assembly.ts"
import { deputyId } from "./deputyId.ts"
import { officeOf, type InOffice, type Sitting } from "./office.ts"

const seat = { number: "1", x: 0.375, y: 0 }
const empty = { number: "12", x: 0.5625, y: 0, constituency: null }
const lecamp = { id: deputyId("PA794954"), constituency: "70-2" }
const delyon = { id: deputyId("PA796046"), constituency: "83-7" }

test("a deputy in office the seat file gives no seat stays in office, found by id and by constituency, and sits nowhere in the room", () => {
  const office = officeOf([lecamp, delyon], { seatOf: new Map([[lecamp.id, seat]]), emptySeats: [empty] })
  assert.deepEqual(office.deputies, [
    { ...lecamp, seat },
    { ...delyon, seat: null },
  ])
  assert.deepEqual(office.byId.get(delyon.id), { ...delyon, seat: null })
  assert.equal(office.byConstituency.get(constituencyCode("83-7") ?? assert.fail())?.id, delyon.id)
  assert.deepEqual(office.sitting.deputies, [{ ...lecamp, seat }])
  assert.deepEqual([...office.sitting.byId.keys()], [lecamp.id])
  assert.deepEqual(office.sitting.emptySeats, [empty])
})

test("a deputy whose constituency is not a code, or is already held, stays in office without being its constituency's holder, with a warning", t => {
  const warn = t.mock.method(console, "warn", () => undefined)
  const unreadable = { id: deputyId("PA1"), constituency: "Var 7" }
  const second = { id: deputyId("PA2"), constituency: "83-7" }
  const office = officeOf([unreadable, delyon, second], { seatOf: new Map(), emptySeats: [] })
  assert.deepEqual(
    office.deputies.map(deputy => deputy.id),
    [unreadable.id, delyon.id, second.id],
  )
  assert.deepEqual([...office.byConstituency].map(([code, deputy]) => [code, deputy.id]), [["83-7", delyon.id]])
  assert.deepEqual(
    warn.mock.calls.map(call => call.arguments),
    [["deputies/init.csv: PA1 has constituency Var 7"], ["deputies/init.csv: PA796046 and PA2 both hold 83-7"]],
  )
})

const unseated: InOffice<typeof delyon> = { ...delyon, seat: null }

export const unseatedProbes = {
  // @ts-expect-error a deputy in office without a seat among the deputies the room draws
  deputies: [unseated] satisfies Sitting<typeof delyon>["deputies"],
  // @ts-expect-error a deputy in office without a seat found by id among the deputies the room draws
  byId: new Map([[delyon.id, unseated]]) satisfies Sitting<typeof delyon>["byId"],
  // @ts-expect-error the deputies in office, some without a seat, taken for the room's sitting
  sitting: { ...officeOf([delyon], { seatOf: new Map(), emptySeats: [] }), emptySeats: [] } satisfies Sitting<typeof delyon>,
}

export type UnseatedOnStage = [
  // @ts-expect-error the stage drawing a deputy in office without a seat
  Accepts<ComponentProps<typeof Stage>["deputies"], readonly Deputy[]>,
  // @ts-expect-error the seats read from a sitting holding a deputy in office without a seat
  Accepts<Parameters<typeof seatsOf>[0], { deputies: readonly Deputy[]; emptySeats: [] }>,
]

type Accepts<Taken, Given extends Taken> = Given
