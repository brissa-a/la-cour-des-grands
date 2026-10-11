import assert from "node:assert/strict"
import { test } from "node:test"
import { VOTE_COLOR, type PlainView, type View } from "../view/view.ts"
import { AGE_COLOR, CIVILITY_COLOR, DEFAULT_VIEW, FEATURES, GROUP, GROUP_COLOR, GROUP_COLUMNS, HEMICYCLE, readerOf, SCRUTIN, VOTE_COLUMNS, VOTE_RINGS } from "./fixtures.test.ts"
import { panelRows, type Offer } from "./rows.ts"
import { cleared, initialState, picked, pressed, waitsFor, type Intent, type NoVote, type ViewState, type VoteChosen } from "./viewState.ts"

const ROWS = panelRows({ features: FEATURES, first: GROUP.key, reading: readerOf([]), chosen: null, votes: null })

function offer(name: string, channel: "color" | "layout", index = 0): Offer {
  const row = ROWS.find(r => r.name === name) ?? assert.fail(name)
  return row[channel][index] ?? assert.fail(`${name} ${channel} ${index}`)
}

const VOTE_ROW = "Vote sur un scrutin"
const RINGS = offer(VOTE_ROW, "layout", 1)
const NOTHING: NoVote = { kind: "none", view: DEFAULT_VIEW, fallback: GROUP_COLOR, pending: null }
const WAITING_RINGS: NoVote = { ...NOTHING, pending: { channel: "layout", choice: VOTE_RINGS } }
const chosen = (view: View): VoteChosen => ({ kind: "chosen", vote: SCRUTIN, view, fallback: GROUP_COLOR })

export const impossible: readonly (Intent | ViewState)[] = [
  // @ts-expect-error an intent waits only for a choice that reads the vote
  { channel: "color", choice: GROUP_COLOR },
  // @ts-expect-error an intent holds a choice of its own channel
  { channel: "color", choice: VOTE_COLUMNS },
  // @ts-expect-error a chosen vote leaves no intent waiting
  { kind: "chosen", vote: SCRUTIN, view: DEFAULT_VIEW, fallback: GROUP_COLOR, pending: null },
  // @ts-expect-error with no vote chosen the view shows none
  { kind: "none", view: { scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE }, fallback: GROUP_COLOR, pending: null },
]

test("a view read with a scrutin starts with that vote chosen, and one without starts with nothing waiting", () => {
  const voted: View = { scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE }
  assert.deepEqual(initialState({ view: voted, fallback: AGE_COLOR }), { kind: "chosen", vote: SCRUTIN, view: voted, fallback: AGE_COLOR })
  assert.deepEqual(initialState({ view: DEFAULT_VIEW, fallback: GROUP_COLOR }), NOTHING)
})

test("a greyed vote glyph waits for a scrutin instead of changing the view, and pressing it again stops waiting", () => {
  const first = pressed(NOTHING, RINGS)
  assert.deepEqual(first, { state: WAITING_RINGS, press: { kind: "wait", waiting: true } })
  assert.ok(waitsFor(first.state.pending, RINGS))
  assert.equal(waitsFor(first.state.pending, offer(VOTE_ROW, "layout", 0)), false)
  assert.equal(waitsFor(first.state.pending, offer(VOTE_ROW, "color")), false)
  assert.equal(waitsFor(null, RINGS), false)
  assert.deepEqual(pressed(WAITING_RINGS, RINGS), { state: NOTHING, press: { kind: "wait", waiting: false } })
  assert.deepEqual(pressed(WAITING_RINGS, offer(VOTE_ROW, "color")), {
    state: { ...NOTHING, pending: { channel: "color", choice: VOTE_COLOR } },
    press: { kind: "wait", waiting: true },
  })
})

test("a plain choice in the channel an intent waits for drops the intent, and one in the other channel keeps it", () => {
  const columns = pressed(WAITING_RINGS, offer("Groupe politique", "layout"))
  assert.deepEqual(columns, { state: { ...NOTHING, view: { scrutin: null, color: GROUP_COLOR, layout: GROUP_COLUMNS } }, press: { kind: "view" } })
  assert.deepEqual(picked(columns.state, SCRUTIN).view, { scrutin: SCRUTIN, color: VOTE_COLOR, layout: GROUP_COLUMNS })
  const age = pressed(WAITING_RINGS, offer("Âge", "color"))
  assert.deepEqual(age.state, { kind: "none", view: { scrutin: null, color: AGE_COLOR, layout: HEMICYCLE }, fallback: AGE_COLOR, pending: WAITING_RINGS.pending })
  assert.deepEqual(picked(age.state, SCRUTIN).view, { scrutin: SCRUTIN, color: AGE_COLOR, layout: VOTE_RINGS })
})

test("a scrutin picked while a glyph waits applies that glyph: the vote in half-rings keeps the colour, the vote in colour keeps the layout", () => {
  const age: PlainView = { scrutin: null, color: AGE_COLOR, layout: GROUP_COLUMNS }
  assert.deepEqual(picked({ kind: "none", view: age, fallback: AGE_COLOR, pending: { channel: "layout", choice: VOTE_RINGS } }, SCRUTIN), {
    kind: "chosen",
    vote: SCRUTIN,
    view: { scrutin: SCRUTIN, color: AGE_COLOR, layout: VOTE_RINGS },
    fallback: AGE_COLOR,
  })
  assert.deepEqual(picked({ kind: "none", view: age, fallback: AGE_COLOR, pending: { channel: "color", choice: VOTE_COLOR } }, SCRUTIN).view, {
    scrutin: SCRUTIN,
    color: VOTE_COLOR,
    layout: GROUP_COLUMNS,
  })
})

test("a scrutin picked with nothing waiting colours by the vote and leaves the layout as it is, keeping the colour it replaces to fall back on", () => {
  const picking = picked({ kind: "none", view: { scrutin: null, color: AGE_COLOR, layout: GROUP_COLUMNS }, fallback: AGE_COLOR, pending: null }, SCRUTIN)
  assert.deepEqual(picking, { kind: "chosen", vote: SCRUTIN, view: { scrutin: SCRUTIN, color: VOTE_COLOR, layout: GROUP_COLUMNS }, fallback: AGE_COLOR })
  assert.deepEqual(picked(chosen({ scrutin: SCRUTIN, color: GROUP_COLOR, layout: VOTE_RINGS }), SCRUTIN).view, { scrutin: SCRUTIN, color: VOTE_COLOR, layout: VOTE_RINGS })
})

test("a plain glyph changes its own channel only, drops a scrutin no channel shows any more but remembers the vote, and keeps the colour to fall back on", () => {
  assert.deepEqual(pressed(NOTHING, offer("Âge", "color")).state, { ...NOTHING, view: { scrutin: null, color: AGE_COLOR, layout: HEMICYCLE }, fallback: AGE_COLOR })
  assert.deepEqual(pressed(NOTHING, offer("Groupe politique", "layout")).state.view, { scrutin: null, color: GROUP_COLOR, layout: GROUP_COLUMNS })
  const voted = chosen({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE })
  assert.deepEqual(pressed(voted, offer("Âge", "color")), { state: { ...voted, view: { scrutin: null, color: AGE_COLOR, layout: HEMICYCLE }, fallback: AGE_COLOR }, press: { kind: "view" } })
  assert.deepEqual(pressed(voted, offer("Groupe politique", "layout")).state, { ...voted, view: { scrutin: SCRUTIN, color: VOTE_COLOR, layout: GROUP_COLUMNS } })
})

test("a vote glyph brings back a remembered scrutin that had left the view", () => {
  const left = chosen(DEFAULT_VIEW)
  assert.deepEqual(pressed(left, offer(VOTE_ROW, "color")).state.view, { scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE })
  assert.deepEqual(pressed(left, offer(VOTE_ROW, "layout", 0)).state.view, { scrutin: SCRUTIN, color: GROUP_COLOR, layout: VOTE_COLUMNS })
})

test("clearing the vote forgets it and any intent, and puts back the last plain colour and the hemicycle in the channels that showed it", () => {
  const voted: VoteChosen = { kind: "chosen", vote: SCRUTIN, view: { scrutin: SCRUTIN, color: VOTE_COLOR, layout: VOTE_RINGS }, fallback: CIVILITY_COLOR }
  assert.deepEqual(cleared(voted), { kind: "none", view: { scrutin: null, color: CIVILITY_COLOR, layout: HEMICYCLE }, fallback: CIVILITY_COLOR, pending: null })
  const columns: VoteChosen = { ...voted, view: { scrutin: SCRUTIN, color: AGE_COLOR, layout: VOTE_COLUMNS } }
  assert.deepEqual(cleared(columns).view, { scrutin: null, color: AGE_COLOR, layout: HEMICYCLE })
  assert.deepEqual(cleared(WAITING_RINGS), NOTHING)
})
