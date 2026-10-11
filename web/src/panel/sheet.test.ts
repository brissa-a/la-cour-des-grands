import assert from "node:assert/strict"
import { test } from "node:test"
import { FEATURES, GROUP, readerOf } from "./fixtures.test.ts"
import { panelRows, type Offer } from "./rows.ts"
import { CLOSED, scheduleCollapse, sheetAfter, type Sheet, type SheetEvent } from "./sheet.ts"
import type { Press } from "./viewState.ts"

const ROWS = panelRows({ features: FEATURES, first: GROUP.key, reading: readerOf([]), chosen: { number: 8427 }, votes: null })

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
const kind = (sheet: Sheet) => sheet.kind

test("a tap on a form without controls collapses the sheet when its wait ends, and a second tap within the wait starts it again", () => {
  const tapped = run(OPEN, pressed(AGE_IN_COLOUR, VIEWED))
  assert.deepEqual(tapped, { kind: "collapsing", collapses: 1 })
  assert.equal(kind(run(tapped, { kind: "elapsed", collapse: 1 })), "closed")
  const again = run(tapped, pressed(offer("Groupe politique", "layout"), VIEWED))
  assert.deepEqual(again, { kind: "collapsing", collapses: 2 })
  assert.equal(run(again, { kind: "elapsed", collapse: 1 }), again)
  assert.equal(kind(run(again, { kind: "elapsed", collapse: 2 })), "closed")
  assert.equal(run(OPEN, { kind: "elapsed", collapse: 0 }), OPEN)
})

test("the wait left over from a collapse that the reader cut short never closes the sheet opened since", () => {
  const reopened = run(OPEN, pressed(AGE_IN_COLOUR, VIEWED), { kind: "close" }, { kind: "open" }, pressed(AGE_IN_COLOUR, VIEWED))
  assert.deepEqual(reopened, { kind: "collapsing", collapses: 2 })
  assert.equal(run(reopened, { kind: "elapsed", collapse: 1 }), reopened)
  assert.equal(kind(run(OPEN, pressed(AGE_IN_COLOUR, VIEWED), { kind: "close" }, { kind: "open" }, { kind: "elapsed", collapse: 1 })), "open")
})

test("a tap on a form of the vote keeps the sheet open for its scrutin control, even from a wait that had started", () => {
  assert.equal(kind(run(OPEN, pressed(VOTE_IN_RINGS, VIEWED))), "open")
  assert.equal(kind(run(OPEN, pressed(AGE_IN_COLOUR, VIEWED), pressed(offer("Vote sur un scrutin", "color"), VIEWED))), "open")
})

test("a greyed vote glyph opens the vote search, tapping it again to stop waiting keeps the sheet open, and leaving the search comes back to the sheet", () => {
  const searching = run(OPEN, pressed(VOTE_IN_RINGS, WAITING))
  assert.equal(kind(searching), "searching")
  assert.equal(kind(run(searching, { kind: "searched" })), "open")
  assert.equal(kind(run(OPEN, pressed(VOTE_IN_RINGS, STOPPED))), "open")
  assert.equal(kind(run(OPEN, { kind: "search" })), "searching")
  assert.equal(run(searching, pressed(AGE_IN_COLOUR, VIEWED)), searching)
})

test("the bar's tabs change the form without opening the sheet, the search needs the sheet, and closing wins in every state", () => {
  assert.equal(run(CLOSED, pressed(VOTE_IN_RINGS, VIEWED)), CLOSED)
  assert.equal(run(CLOSED, { kind: "search" }), CLOSED)
  assert.equal(run(CLOSED, { kind: "searched" }), CLOSED)
  assert.equal(run(OPEN, { kind: "searched" }), OPEN)
  const collapsing = run(OPEN, pressed(AGE_IN_COLOUR, VIEWED))
  assert.equal(run(collapsing, { kind: "open" }), collapsing)
  for (const state of [OPEN, collapsing, run(OPEN, { kind: "search" })]) assert.equal(kind(run(state, { kind: "close" })), "closed")
  assert.equal(run(CLOSED, { kind: "close" }), CLOSED)
})

test("a collapsing sheet asks for the end of its wait after 400 ms and hands back the way to cancel it, and other states wait for nothing", () => {
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = []
  const after = (ms: number, then: () => void) => {
    const timer = { ms, run: then, cancelled: false }
    timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }
  const events: SheetEvent[] = []
  for (const state of ["closed", "open", "searching"] as const) assert.equal(scheduleCollapse({ kind: state, collapses: 3 }, event => events.push(event), after), undefined)
  assert.equal(timers.length, 0)
  const cancel = scheduleCollapse({ kind: "collapsing", collapses: 3 }, event => events.push(event), after)
  const [timer, ...others] = timers
  assert.ok(timer && others.length === 0)
  assert.equal(timer.ms, 400)
  timer.run()
  assert.deepEqual(events, [{ kind: "elapsed", collapse: 3 }])
  cancel?.()
  assert.equal(timer.cancelled, true)
})
