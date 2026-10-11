import assert from "node:assert/strict"
import { test } from "node:test"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { SEAT, VOTE } from "../sources/shapes.ts"
import { voteId } from "../votes/voteId.ts"
import { choiceKey, panelRows, pressed } from "../panel/rows.ts"
import { withParams } from "../url.ts"
import { HEMICYCLE, mainOf, parseView, viewOf, viewParams, VOTE_COLOR, withoutScrutin, type View } from "./view.ts"

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
  { scrutin: null, color: { paint: "palette", of: GROUP }, layout: { form: "hemicycle", picks: { main: AGE } } },
  // @ts-expect-error columns of seats
  { scrutin: null, color: { paint: "palette", of: GROUP }, layout: { form: "columns", picks: { main: SEAT } } },
  // @ts-expect-error half-rings of a feature, which has no turnout to split
  { scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "halfRings", picks: { main: CIVILITY } } },
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
    layout: { form: "columns", picks: { main: CIVILITY } },
  })
  assert.deepEqual(parse("?color=bogus&chart=bogus&layout=bogus").view, parse("").view)
  assert.deepEqual(parse("?color=vote&chart=vote").view, parse("").view)
  assert.deepEqual(parse("?chart=deputies/init.csv:civility&layout=halfRings").view, parse("?chart=deputies/init.csv:civility").view)
})

test("a scrutin in a link colours by the vote unless only the layout shows it, and an explicit vote colour wins", () => {
  const vote = (search: string) => parse(`?vote=VTANR5L17V8427&${search}`).view
  assert.deepEqual(vote(""), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE })
  assert.deepEqual(vote("chart=vote&color=deputies/init.csv:age"), { scrutin: SCRUTIN, color: { paint: "gradient", of: AGE }, layout: { form: "columns", picks: { main: VOTE } } })
  assert.deepEqual(vote("chart=vote&color=vote"), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "columns", picks: { main: VOTE } } })
  assert.deepEqual(vote("chart=deputies/init.csv:age"), { scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "columns", picks: { main: AGE } } })
  assert.deepEqual(parse("?vote=VTANR5L17V8427&color=deputies/init.csv:age").fallback, { paint: "gradient", of: AGE })
  assert.deepEqual(parse("?vote=nope").view, parse("").view)
})

test("a view is written with the scrutin first, the default colour and the default form left out, and old links keep their parameter order", () => {
  assert.equal(written(parse("").view), "")
  assert.equal(written({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "columns", picks: { main: AGE } } }), "vote=VTANR5L17V8427&color=vote&chart=deputies%2Finit.csv%3Aage")
  const old = "?chart=deputies%2Finit.csv%3Aage&color=deputies%2Finit.csv%3Aregion&deputy=PA1"
  assert.equal(written({ scrutin: null, color: { paint: "palette", of: CIVILITY }, layout: HEMICYCLE }, old), "color=deputies%2Finit.csv%3Acivility&deputy=PA1")
})

const OFFERS = panelRows({ features: FEATURES, first: GROUP.key, reading: () => null, chosen: { number: 8427 } })
const COLOR_OFFERS = OFFERS.flatMap(row => row.color)
const LAYOUT_OFFERS = OFFERS.flatMap(row => row.layout)

test("every view the panel's glyphs give survives a round trip through the link", () => {
  for (const color of COLOR_OFFERS)
    for (const layout of LAYOUT_OFFERS) {
      const view = viewOf(color.choice, layout.choice, SCRUTIN)
      assert.ok(view)
      assert.deepEqual(parse(`?${written(view)}`).view, view, `${choiceKey(color.choice)} × ${choiceKey(layout.choice)}`)
    }
})

test("a vote drawn in half-rings keeps its link: the form is read back from it and the same link is written", () => {
  const link = "vote=VTANR5L17V8427&chart=vote&layout=halfRings"
  const { view } = parse(`?${link}`)
  assert.deepEqual(view, { scrutin: SCRUTIN, color: { paint: "palette", of: GROUP }, layout: { form: "halfRings", picks: { main: VOTE } } })
  assert.equal(written(view), link)
})

test("a view drops a scrutin that no channel shows and refuses a vote without one", () => {
  assert.equal(viewOf({ paint: "palette", of: GROUP }, HEMICYCLE, SCRUTIN)?.scrutin, null)
  assert.equal(viewOf(VOTE_COLOR, HEMICYCLE, null), null)
  assert.equal(viewOf({ paint: "palette", of: GROUP }, { form: "columns", picks: { main: VOTE } }, null), null)
})

test("leaving the scrutin out keeps the channels that do not read it and puts back the fallback colour and the hemicycle", () => {
  const age = { paint: "gradient", of: AGE } as const
  const columns = { form: "columns", picks: { main: CIVILITY } } as const
  assert.deepEqual(withoutScrutin({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: columns }, age), { scrutin: null, color: age, layout: columns })
  assert.deepEqual(withoutScrutin({ scrutin: SCRUTIN, color: age, layout: { form: "halfRings", picks: { main: VOTE } } }, { paint: "palette", of: GROUP }), { scrutin: null, color: age, layout: HEMICYCLE })
})

test("each glyph of the panel stands for its own choice, and the view it gives presses that glyph again and no other", () => {
  const keys = [...COLOR_OFFERS, ...LAYOUT_OFFERS].map(offer => choiceKey(offer.choice))
  assert.equal(new Set(keys).size, keys.length)
  for (const color of COLOR_OFFERS)
    for (const layout of LAYOUT_OFFERS) {
      const view = viewOf(color.choice, layout.choice, SCRUTIN)
      assert.ok(view)
      assert.deepEqual(COLOR_OFFERS.filter(offer => pressed(view, offer)), [color])
      assert.deepEqual(LAYOUT_OFFERS.filter(offer => pressed(view, offer)), [layout])
    }
})

test("links shared before the registry keep the view they showed", () => {
  const summary = (search: string) => {
    const { view } = parse(search)
    return [view.scrutin, view.color.paint, mainOf(view.color).kind, view.layout.form, mainOf(view.layout).kind]
  }
  assert.deepEqual(summary("?color=deputies%2Finit.csv%3Aage"), [null, "gradient", "number", "hemicycle", "seat"])
  assert.deepEqual(summary("?chart=deputies%2Finit.csv%3Aage"), [null, "palette", "category", "columns", "number"])
  assert.deepEqual(summary("?chart=deputies%2Finit.csv%3Acivility&color=deputies%2Finit.csv%3Aage"), [null, "gradient", "number", "columns", "category"])
  assert.deepEqual(summary("?vote=VTANR5L17V8427"), [SCRUTIN, "palette", "vote", "hemicycle", "seat"])
  assert.deepEqual(summary("?vote=VTANR5L17V8427&color=vote&chart=vote"), [SCRUTIN, "palette", "vote", "columns", "vote"])
  assert.deepEqual(summary("?vote=VTANR5L17V8427&color=deputies%2Finit.csv%3Aage&chart=vote"), [SCRUTIN, "gradient", "number", "columns", "vote"])
})
