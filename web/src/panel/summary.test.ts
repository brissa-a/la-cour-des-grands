import assert from "node:assert/strict"
import { test } from "node:test"
import { FORMS } from "../forms/registry.ts"
import { PAINTS } from "../paint/registry.ts"
import { VOTE_COLOR, type View } from "../view/view.ts"
import { AGE_COLOR, DEFAULT_VIEW, GROUP_COLOR, HEMICYCLE, SCRUTIN, VOTE_COLUMNS, VOTE_RINGS } from "./fixtures.test.ts"
import { afterPick, composition, sentenceText, summary } from "./summary.ts"

test("the summary says the colour channel, then the layout channel, each led by the feature and drawn with its glyph", () => {
  const said = (view: View, number: number | null) => summary(view, { number }).map(sentenceText)
  assert.deepEqual(said(DEFAULT_VIEW, null), ["Groupe politique en couleur", "Siège en hémicycle"])
  assert.deepEqual(said({ scrutin: SCRUTIN, color: AGE_COLOR, layout: VOTE_RINGS }, 8427), ["Âge en couleur", "Vote n° 8427 en demi-anneaux"])
  assert.deepEqual(said({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: VOTE_COLUMNS }, null), ["Vote sur un scrutin en couleur", "Vote sur un scrutin en colonnes"])
  const [color, layout] = summary({ scrutin: SCRUTIN, color: GROUP_COLOR, layout: VOTE_RINGS }, null)
  assert.equal(color.glyph, PAINTS.palette.glyph)
  assert.equal(layout.glyph, FORMS.halfRings.glyph)
  assert.equal(summary({ scrutin: null, color: AGE_COLOR, layout: HEMICYCLE }, null)[0].glyph, PAINTS.gradient.glyph)
})

test("a past composition gives its date, then its empty seats when there are some", () => {
  assert.equal(composition("2026-07-20", 13), "Composition au 20 juil. 2026 · 13 sièges vides")
  assert.equal(composition("2026-07-20", 1), "Composition au 20 juil. 2026 · 1 siège vide")
  assert.equal(composition("2026-07-20", 0), "Composition au 20 juil. 2026")
})

test("the vote search says what the chosen vote will show: the form waiting for it, or the colour when nothing waits", () => {
  assert.equal(afterPick(null), "Une fois choisi, le vote sera en couleur")
  assert.equal(afterPick({ channel: "layout", choice: VOTE_RINGS }), "Une fois choisi, le vote sera en demi-anneaux")
  assert.equal(afterPick({ channel: "layout", choice: VOTE_COLUMNS }), "Une fois choisi, le vote sera en colonnes")
  assert.equal(afterPick({ channel: "color", choice: VOTE_COLOR }), "Une fois choisi, le vote sera en couleur")
})
