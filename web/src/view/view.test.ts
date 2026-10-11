import assert from "node:assert/strict"
import { test } from "node:test"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { SEAT, VOTE } from "../sources/shapes.ts"
import { voteId } from "../votes/voteId.ts"
import { colorOptions, layoutOptions } from "./options.ts"
import { withParams } from "../url.ts"
import { HEMICYCLE, parseView, viewOf, viewParams, VOTE_COLOR, type View } from "./view.ts"

const GROUP: CategoryFeature = { kind: "category", key: "deputies/init.csv:group", file: "deputies/init.csv", column: "group", title: "Groupe politique", values: "g" }
const CIVILITY: CategoryFeature = { kind: "category", key: "deputies/init.csv:civility", file: "deputies/init.csv", column: "civility", title: "Civilité", values: "c" }
const AGE: NumberFeature = { kind: "number", key: "deputies/init.csv:age", file: "deputies/init.csv", column: "age", title: "Âge" }
const FEATURES = [CIVILITY, AGE, GROUP]
const SCRUTIN = voteId("VTANR5L17V8427")
assert.ok(SCRUTIN)

export const impossible: readonly View[] = [
  // @ts-expect-error a vote shown without a scrutin
  { scrutin: null, color: VOTE_COLOR, layout: HEMICYCLE },
  // @ts-expect-error a scrutin that no channel shows
  { scrutin: SCRUTIN, color: { paint: "palette", of: GROUP }, layout: HEMICYCLE },
  // @ts-expect-error a gradient on a category
  { scrutin: null, color: { paint: "gradient", of: GROUP }, layout: HEMICYCLE },
  // @ts-expect-error a palette on a number
  { scrutin: null, color: { paint: "palette", of: AGE }, layout: HEMICYCLE },
  // @ts-expect-error the seat in colour
  { scrutin: null, color: { paint: "palette", of: SEAT }, layout: HEMICYCLE },
  // @ts-expect-error the hemicycle laid out by a feature
  { scrutin: null, color: { paint: "palette", of: GROUP }, layout: { form: "hemicycle", of: AGE } },
  // @ts-expect-error columns of seats
  { scrutin: null, color: { paint: "palette", of: GROUP }, layout: { form: "columns", of: SEAT } },
]

function parse(search: string) {
  const params = new URLSearchParams(search)
  const parsed = parseView(name => params.get(name), FEATURES, GROUP.key)
  assert.ok(parsed, search)
  return parsed
}

function written(view: View, search = ""): string {
  return withParams(viewParams(view, GROUP.key), search, "").replace(/^\?/, "")
}

test("a link reads its colour and layout features, falls back to the default colour and the hemicycle, and ignores unknown ones", () => {
  assert.deepEqual(parse("").view, { scrutin: null, color: { paint: "palette", of: GROUP }, layout: HEMICYCLE })
  assert.deepEqual(parse("?color=deputies/init.csv:age&chart=deputies/init.csv:civility").view, {
    scrutin: null,
    color: { paint: "gradient", of: AGE },
    layout: { form: "columns", of: CIVILITY },
  })
  assert.deepEqual(parse("?color=bogus&chart=bogus&layout=bogus").view, parse("").view)
  assert.deepEqual(parse("?color=vote&chart=vote").view, parse("").view)
})

test("a scrutin in a link colours by the vote unless only the layout shows it, and an explicit vote colour wins", () => {
  const vote = (search: string) => parse(`?vote=VTANR5L17V8427&${search}`).view
  assert.deepEqual(vote(""), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE })
  assert.deepEqual(vote("chart=vote&color=deputies/init.csv:age"), { scrutin: SCRUTIN, color: { paint: "gradient", of: AGE }, layout: { form: "columns", of: VOTE } })
  assert.deepEqual(vote("chart=vote&color=vote"), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "columns", of: VOTE } })
  assert.deepEqual(vote("chart=deputies/init.csv:age"), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "columns", of: AGE } })
  assert.deepEqual(parse("?vote=VTANR5L17V8427&color=deputies/init.csv:age").fallback, { paint: "gradient", of: AGE })
  assert.deepEqual(parse("?vote=nope").view, parse("").view)
})

test("a view is written with the scrutin first, the default colour and the default form left out, and old links keep their parameter order", () => {
  assert.equal(written(parse("").view), "")
  assert.equal(written({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "columns", of: AGE } }), "vote=VTANR5L17V8427&color=vote&chart=deputies%2Finit.csv%3Aage")
  const old = "?chart=deputies%2Finit.csv%3Aage&color=deputies%2Finit.csv%3Aregion&deputy=PA1"
  assert.equal(written({ scrutin: null, color: { paint: "palette", of: CIVILITY }, layout: HEMICYCLE }, old), "color=deputies%2Finit.csv%3Acivility&deputy=PA1")
})

test("every view the pickers offer survives a round trip through the link", () => {
  for (const color of colorOptions(FEATURES, "Scrutin n° 8427"))
    for (const layout of layoutOptions(FEATURES, "Scrutin n° 8427")) {
      const view = viewOf(color.choice, layout.choice, SCRUTIN)
      assert.ok(view)
      assert.deepEqual(parse(`?${written(view)}`).view, view, `${color.id} × ${layout.id}`)
    }
})

test("a view drops a scrutin that no channel shows and refuses a vote without one", () => {
  assert.equal(viewOf({ paint: "palette", of: GROUP }, HEMICYCLE, SCRUTIN)?.scrutin, null)
  assert.equal(viewOf(VOTE_COLOR, HEMICYCLE, null), null)
  assert.equal(viewOf({ paint: "palette", of: GROUP }, { form: "columns", of: VOTE }, null), null)
})

test("the pickers offer the room first, each feature in catalog order, then the scrutin once one is chosen", () => {
  assert.deepEqual(layoutOptions(FEATURES, null).map(o => [o.label, o.group]), [
    ["Hémicycle", null],
    ["Civilité", "deputies/init.csv"],
    ["Âge", "deputies/init.csv"],
    ["Groupe politique", "deputies/init.csv"],
  ])
  assert.deepEqual(colorOptions(FEATURES, "Scrutin n° 1").map(o => [o.label, o.group]), [
    ["Civilité", "deputies/init.csv"],
    ["Âge", "deputies/init.csv"],
    ["Groupe politique", "deputies/init.csv"],
    ["Scrutin n° 1", "Scrutin"],
  ])
})
