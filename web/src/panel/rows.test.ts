import assert from "node:assert/strict"
import { test } from "node:test"
import type { CategoryFeature } from "../data/features.ts"
import { mainOf, VOTE_COLOR, type View } from "../view/view.ts"
import {
  AGE,
  AGE_COLOR,
  categoryValues,
  CIVILITY,
  DEFAULT_VIEW,
  FEATURES,
  GROUP,
  GROUP_COLOR,
  GROUP_COLUMNS,
  numberValues,
  readerOf,
  readVoteOf,
  SCRUTIN,
  table,
  VOTE_COLUMNS,
  VOTE_RINGS,
} from "./fixtures.test.ts"
import { CHANNELS, choiceKey, greyedReason, holds, layoutHint, offerLabel, panelRows, pressed, replaces, rowKey, unfoldedRow, type ChosenVote, type Offer, type Row, type RowKey } from "./rows.ts"

const rowsWith = (chosen: ChosenVote | null, reading = readerOf([])) => panelRows({ features: FEATURES, first: GROUP.key, reading, chosen })

const named = (rows: readonly Row[], name: string) => rows.find(row => row.name === name) ?? assert.fail(name)

export function keyedByHand(row: Row): readonly RowKey[] {
  // @ts-expect-error a row key comes only from rowKey
  return [row.key, "deputies/init.csv:group"]
}

export function rowAgainstChoice(row: Row, offer: Offer): boolean {
  // @ts-expect-error a row key is never compared with a choice key
  return row.key === choiceKey(offer.choice)
}

test("rows list the default colour feature first, the others in catalog order, then the seat and the vote, each with the colourings and forms the registries accept", () => {
  const rows = rowsWith(null)
  assert.deepEqual(
    rows.map(row => [row.name, row.color.map(offer => offer.label), row.layout.map(offer => offer.label)]),
    [
      ["Groupe politique", ["Couleurs"], ["Colonnes"]],
      ["Civilité", ["Couleurs"], ["Colonnes"]],
      ["Âge", ["Dégradé"], ["Colonnes"]],
      ["Siège", [], ["Hémicycle"]],
      ["Vote sur un scrutin", ["Couleurs"], ["Colonnes", "Demi-anneaux"]],
    ],
  )
  for (const row of rows) for (const offer of [...row.color, ...row.layout]) assert.equal(rowKey(mainOf(offer.choice)), row.key, `${row.name} ${offer.label}`)
})

test("exactly one colour glyph and one layout glyph are pressed across the panel, the ones the view shows", () => {
  const rows = rowsWith({ number: 8427 })
  const pressedIn = (view: View) => CHANNELS.map(channel => rows.flatMap(row => row[channel].filter(offer => pressed(view, offer)).map(offer => offerLabel(row, offer))))
  assert.deepEqual(pressedIn(DEFAULT_VIEW), [["Groupe politique en couleur · Couleurs"], ["Siège en hémicycle"]])
  assert.deepEqual(pressedIn({ scrutin: null, color: GROUP_COLOR, layout: GROUP_COLUMNS }), [["Groupe politique en couleur · Couleurs"], ["Groupe politique en colonnes"]])
  assert.deepEqual(pressedIn({ scrutin: SCRUTIN, color: AGE_COLOR, layout: VOTE_RINGS }), [["Âge en couleur · Dégradé"], ["Vote n° 8427 en demi-anneaux"]])
  assert.deepEqual(pressedIn({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: VOTE_COLUMNS }), [["Vote n° 8427 en couleur · Couleurs"], ["Vote n° 8427 en colonnes"]])
})

test("each row knows the channels it holds, and the row holding the layout is the one unfolded", () => {
  const rows = rowsWith({ number: 8427 })
  const held = (view: View) => rows.flatMap(row => holds(view, row).map(channel => `${row.name} ${channel}`))
  assert.deepEqual(held(DEFAULT_VIEW), ["Groupe politique color", "Siège layout"])
  assert.deepEqual(held({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: VOTE_RINGS }), ["Vote sur un scrutin color", "Vote sur un scrutin layout"])
  assert.equal(unfoldedRow(DEFAULT_VIEW), named(rows, "Siège").key)
  assert.equal(unfoldedRow({ scrutin: SCRUTIN, color: GROUP_COLOR, layout: VOTE_RINGS }), named(rows, "Vote sur un scrutin").key)
})

test("before a vote is chosen only the vote row is greyed, saying why, and a chosen vote, even one out of the view, enables it", () => {
  const greyed = (chosen: ChosenVote | null) => rowsWith(chosen).map(row => [row.name, greyedReason(row)])
  assert.deepEqual(greyed(null), [
    ["Groupe politique", null],
    ["Civilité", null],
    ["Âge", null],
    ["Siège", null],
    ["Vote sur un scrutin", "Choisissez d'abord un scrutin"],
  ])
  assert.ok(greyed({ number: null }).every(([, reason]) => reason === null))
})

test("a row head puts each value before its unit: the count of each of a few values, the number of many, the range of numbers, the seats of the room", () => {
  const REGION: CategoryFeature = { ...CIVILITY, key: "deputies/init.csv:region", title: "Région" }
  const OTHER: CategoryFeature = { ...CIVILITY, key: "f:other", title: "Autre" }
  const THREE: CategoryFeature = { ...CIVILITY, key: "f:three", title: "Trois" }
  const reading = readerOf([
    categoryValues(GROUP, table("a", "b", "c", "d", "e"), ["a", "b", "c", "d", "e", ""]),
    categoryValues(CIVILITY, table("M.", "Mme"), ["M.", "Mme", "M.", "", "M.", "Mme"]),
    categoryValues(REGION, table("n", "s", "e", "o"), ["n", "s", "e", "o", "n", "n"]),
    categoryValues(OTHER, table("w", "x", "y", "z"), ["w", "x", "y", "z", "w", "w"]),
    categoryValues(THREE, table("x", "y", "z"), ["x", "y", "z", "x", "x", "x"]),
    numberValues(AGE, [83, 25, null, 52, 40, 61]),
  ])
  const rows = panelRows({ features: [GROUP, CIVILITY, REGION, OTHER, THREE, AGE], first: GROUP.key, reading, chosen: null })
  const heads = rows.flatMap(row => (row.kind === "feature" ? [[row.name, row.figures.map(({ value, unit }) => `${value} ${unit}`)]] : []))
  assert.deepEqual(heads, [
    ["Groupe politique", ["5 groupes"]],
    ["Civilité", ["3 M.", "2 Mme"]],
    ["Région", ["4 régions"]],
    ["Autre", ["4 valeurs"]],
    ["Trois", ["4 x", "1 y", "1 z"]],
    ["Âge", ["25–83 ans"]],
    ["Siège", ["8 sièges"]],
  ])
})

test("a number head shows one value when all are equal and nothing when none is known, and an unloaded feature shows no value yet", () => {
  const head = (held: readonly (number | null)[]) => {
    const rows = panelRows({ features: [AGE], first: AGE.key, reading: readerOf([numberValues(AGE, held)]), chosen: null })
    const [row] = rows
    return row?.kind === "feature" ? row.figures : assert.fail()
  }
  assert.deepEqual(head([52, 52, null, null, null, 52]), [{ value: "52", unit: "ans" }])
  assert.deepEqual(head([null, null, null, null, null, null]), [])
  const unloaded = panelRows({ features: FEATURES, first: GROUP.key, reading: () => null, chosen: null })
  assert.deepEqual(unloaded.map(row => (row.kind === "feature" ? row.figures : null)), [[], [], [], [], null])
})

test("a glyph of another row says which feature it takes the channel from, and one of the holding row says nothing", () => {
  const rows = rowsWith({ number: 8427 })
  const offer = (name: string, channel: "color" | "layout", index = 0) => named(rows, name)[channel][index] ?? assert.fail(`${name} ${channel}`)
  const view: View = { scrutin: SCRUTIN, color: GROUP_COLOR, layout: VOTE_COLUMNS }
  assert.equal(replaces(view, offer("Civilité", "color"), { number: 8427 }), "Remplace Groupe politique en couleur")
  assert.equal(replaces(view, offer("Âge", "layout"), { number: 8427 }), "Remplace Vote n° 8427 en disposition")
  assert.equal(replaces(view, offer("Vote sur un scrutin", "layout", 1), { number: 8427 }), null)
  assert.equal(replaces(view, offer("Groupe politique", "layout"), null), "Remplace Vote sur un scrutin en disposition")
  assert.equal(replaces(view, offer("Groupe politique", "color"), null), null)
})

test("the unfolded row tells the order its form lays the parts in, the absent set apart by the half-rings", () => {
  const vote = readVoteOf(["for", "against", "abstain", "absent", "for", "against"])
  const reading = readerOf([categoryValues(GROUP, table("a", "b", "c"), ["c", "a", "", "b", "a", "a"]), numberValues(AGE, [27, 81, null, 40, 33, 52])], vote)
  assert.equal(layoutHint(GROUP_COLUMNS, reading(GROUP)), "de a à c")
  assert.equal(layoutHint({ form: "columns", picks: { main: AGE } }, reading(AGE)), "de 25–29 ans à 80–84 ans")
  assert.equal(layoutHint(VOTE_COLUMNS, reading(VOTE_COLUMNS.picks.main)), "de Pour à Absent")
  assert.equal(layoutHint(VOTE_RINGS, reading(VOTE_RINGS.picks.main)), "de Pour à Abstention")
  assert.equal(layoutHint(DEFAULT_VIEW.layout, reading(DEFAULT_VIEW.layout.picks.main)), "Chaque député à sa place")
  assert.equal(layoutHint(GROUP_COLUMNS, null), null)
  const single = readerOf([categoryValues(GROUP, table("a", "b"), ["a", "a", "", "a", "a", "a"])])
  assert.equal(layoutHint(GROUP_COLUMNS, single(GROUP)), "a")
  const none = readerOf([categoryValues(GROUP, table("a"), ["", "", "", "", "", ""])])
  assert.equal(layoutHint(GROUP_COLUMNS, none(GROUP)), null)
})
