import assert from "node:assert/strict"
import { test } from "node:test"
import { FEATURES, GROUP, readerOf } from "./fixtures.test.ts"
import { panelRows, type Offer } from "./rows.ts"
import { CLOSED, scheduleCollapse, sheetAfter, type Sheet, type SheetEvent } from "./sheet.ts"
import type { Press } from "./viewState.ts"

const ROWS = panelRows({ features: FEATURES, first: GROUP.key, reading: readerOf([]), chosen: { number: 8427 } })

function offer(name: string, channel: "color" | "layout", index = 0): Offer {
  const row = ROWS.find(r => r.name === name) ?? assert.fail(name)
  return row[channel][index] ?? assert.fail(`${name} ${channel} ${index}`)
}

const AGE_IN_COLOUR = offer("Âge", "color")
const VOTE_IN_RINGS = offer("Vote sur un scrutin", "layout", 1)
const VIEWED: Press = { kind: "view" }
const WAITING: Press = { kind: "wait", waiting: true }
const STOPPED: Press = { kind: "wait", waiting: false }

const pressed = (pressedOffer: Offer, result: Press): SheetEvent => ({ kind: "pressed", offer: pressedOffer, press: result })
const run = (from: Sheet, ...events: readonly SheetEvent[]) => events.reduce(sheetAfter, from)
const OPEN = run(CLOSED, { kind: "open" })

test("a tap on a form without controls collapses the sheet when its wait ends, and a second tap within the wait starts it again", () => {
  const tapped = run(OPEN, pressed(AGE_IN_COLOUR, VIEWED))
  assert.deepEqual(tapped, { kind: "collapsing", tap: 1 })
  assert.deepEqual(run(tapped, { kind: "elapsed", tap: 1 }), CLOSED)
  const again = run(tapped, pressed(offer("Groupe politique", "layout"), VIEWED))
  assert.deepEqual(again, { kind: "collapsing", tap: 2 })
  assert.deepEqual(run(again, { kind: "elapsed", tap: 1 }), again)
  assert.deepEqual(run(again, { kind: "elapsed", tap: 2 }), CLOSED)
  assert.deepEqual(run(OPEN, { kind: "elapsed", tap: 1 }), OPEN)
})

test("a tap on a form of the vote keeps the sheet open for its scrutin control, even from a wait that had started", () => {
  assert.deepEqual(run(OPEN, pressed(VOTE_IN_RINGS, VIEWED)), OPEN)
  assert.deepEqual(run(OPEN, pressed(AGE_IN_COLOUR, VIEWED), pressed(offer("Vote sur un scrutin", "color"), VIEWED)), OPEN)
})

test("a greyed vote glyph opens the vote search, tapping it again to stop waiting keeps the sheet open, and leaving the search comes back to the sheet", () => {
  const searching = run(OPEN, pressed(VOTE_IN_RINGS, WAITING))
  assert.deepEqual(searching, { kind: "searching" })
  assert.deepEqual(run(searching, { kind: "searched" }), OPEN)
  assert.deepEqual(run(OPEN, pressed(VOTE_IN_RINGS, STOPPED)), OPEN)
  assert.deepEqual(run(OPEN, { kind: "search" }), searching)
  assert.deepEqual(run(searching, pressed(AGE_IN_COLOUR, VIEWED)), searching)
})

test("the bar's tabs change the form without opening the sheet, the search needs the sheet, and closing wins in every state", () => {
  assert.deepEqual(run(CLOSED, pressed(VOTE_IN_RINGS, VIEWED)), CLOSED)
  assert.deepEqual(run(CLOSED, { kind: "search" }), CLOSED)
  assert.deepEqual(run(CLOSED, { kind: "searched" }), CLOSED)
  assert.deepEqual(run(OPEN, { kind: "searched" }), OPEN)
  const collapsing = run(OPEN, pressed(AGE_IN_COLOUR, VIEWED))
  assert.deepEqual(run(collapsing, { kind: "open" }), collapsing)
  for (const state of [OPEN, collapsing, run(OPEN, { kind: "search" }), CLOSED]) assert.deepEqual(run(state, { kind: "close" }), CLOSED)
})

test("a collapsing sheet asks for the end of its wait after 400 ms and cancels it when it leaves that state, and other states wait for nothing", () => {
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = []
  const after = (ms: number, then: () => void) => {
    const timer = { ms, run: then, cancelled: false }
    timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }
  const events: SheetEvent[] = []
  const searching: Sheet = { kind: "searching" }
  for (const state of [CLOSED, OPEN, searching]) assert.equal(scheduleCollapse(state, event => events.push(event), after), undefined)
  assert.equal(timers.length, 0)
  const cancel = scheduleCollapse({ kind: "collapsing", tap: 3 }, event => events.push(event), after)
  const [timer, ...others] = timers
  assert.ok(timer && others.length === 0)
  assert.equal(timer.ms, 400)
  timer.run()
  assert.deepEqual(events, [{ kind: "elapsed", tap: 3 }])
  cancel?.()
  assert.equal(timer.cancelled, true)
})
