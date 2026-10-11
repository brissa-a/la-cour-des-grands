import assert from "node:assert/strict"
import { test } from "node:test"
import { VOTE_COLOR, type View } from "../view/view.ts"
import { AGE_COLOR, DEFAULT_VIEW, FEATURES, GROUP, GROUP_COLOR, GROUP_COLUMNS, HEMICYCLE, readerOf, SCRUTIN, VOTE_COLUMNS, VOTE_RINGS } from "./fixtures.test.ts"
import { pick, press, waitsFor, type Pending } from "./intent.ts"
import { panelRows, type Offer, type Row } from "./rows.ts"

const rows = (chosen: { number: number | null } | null) => panelRows({ features: FEATURES, first: GROUP.key, reading: readerOf([]), chosen })

function offer(name: string, channel: "color" | "layout", index = 0, chosen: { number: number | null } | null = null): Offer {
  const row: Row = rows(chosen).find(r => r.name === name) ?? assert.fail(name)
  return row[channel][index] ?? assert.fail(`${name} ${channel} ${index}`)
}

const VOTE_ROW = "Vote sur un scrutin"

test("a greyed vote glyph waits for a scrutin instead of changing the view, and pressing it again stops waiting", () => {
  const rings = offer(VOTE_ROW, "layout", 1)
  const pressed = press(rings, DEFAULT_VIEW, null, null)
  assert.deepEqual(pressed, { kind: "wait", pending: { needs: "scrutin", intent: { channel: "layout", choice: VOTE_RINGS } } })
  assert.ok(pressed.kind === "wait")
  assert.ok(waitsFor(pressed.pending, offer(VOTE_ROW, "layout", 1)))
  assert.equal(waitsFor(pressed.pending, offer(VOTE_ROW, "layout", 0)), false)
  assert.equal(waitsFor(pressed.pending, offer(VOTE_ROW, "color")), false)
  assert.deepEqual(press(offer(VOTE_ROW, "layout", 1), DEFAULT_VIEW, null, pressed.pending), { kind: "wait", pending: null })
  const colour = press(offer(VOTE_ROW, "color"), DEFAULT_VIEW, null, pressed.pending)
  assert.deepEqual(colour, { kind: "wait", pending: { needs: "scrutin", intent: { channel: "color", choice: VOTE_COLOR } } })
  assert.ok(colour.kind === "wait" && waitsFor(colour.pending, offer(VOTE_ROW, "color")))
  assert.equal(waitsFor(colour.pending, offer(VOTE_ROW, "layout", 0)), false)
  assert.equal(waitsFor(null, offer(VOTE_ROW, "color")), false)
})

test("a scrutin picked while a glyph waits applies that glyph: the vote in half-rings keeps the colour, the vote in colour keeps the layout", () => {
  const layout: Pending = { needs: "scrutin", intent: { channel: "layout", choice: VOTE_RINGS } }
  const color: Pending = { needs: "scrutin", intent: { channel: "color", choice: VOTE_COLOR } }
  const age: View = { scrutin: null, color: AGE_COLOR, layout: GROUP_COLUMNS }
  assert.deepEqual(pick(age, layout, SCRUTIN), { scrutin: SCRUTIN, color: AGE_COLOR, layout: VOTE_RINGS })
  assert.deepEqual(pick(age, color, SCRUTIN), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: GROUP_COLUMNS })
})

test("a scrutin picked with nothing waiting colours by the vote and leaves the layout as it is", () => {
  assert.deepEqual(pick({ scrutin: null, color: AGE_COLOR, layout: GROUP_COLUMNS }, null, SCRUTIN), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: GROUP_COLUMNS })
  assert.deepEqual(pick({ scrutin: SCRUTIN, color: GROUP_COLOR, layout: VOTE_RINGS }, null, SCRUTIN), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: VOTE_RINGS })
})

test("a plain glyph changes its own channel only, and drops a scrutin no channel shows any more", () => {
  assert.deepEqual(press(offer("Âge", "color"), DEFAULT_VIEW, null, null), { kind: "view", view: { scrutin: null, color: AGE_COLOR, layout: HEMICYCLE } })
  assert.deepEqual(press(offer("Groupe politique", "layout"), DEFAULT_VIEW, null, null), { kind: "view", view: { scrutin: null, color: GROUP_COLOR, layout: GROUP_COLUMNS } })
  const voted: View = { scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE }
  assert.deepEqual(press(offer("Âge", "color"), voted, SCRUTIN, null), { kind: "view", view: { scrutin: null, color: AGE_COLOR, layout: HEMICYCLE } })
  assert.deepEqual(press(offer("Groupe politique", "layout"), voted, SCRUTIN, null), { kind: "view", view: { scrutin: SCRUTIN, color: VOTE_COLOR, layout: GROUP_COLUMNS } })
})

test("a vote glyph brings back a remembered scrutin that had left the view", () => {
  const chosen = { number: 8427 }
  assert.deepEqual(press(offer(VOTE_ROW, "color", 0, chosen), DEFAULT_VIEW, SCRUTIN, null), { kind: "view", view: { scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE } })
  assert.deepEqual(press(offer(VOTE_ROW, "layout", 0, chosen), DEFAULT_VIEW, SCRUTIN, null), { kind: "view", view: { scrutin: SCRUTIN, color: GROUP_COLOR, layout: VOTE_COLUMNS } })
})
