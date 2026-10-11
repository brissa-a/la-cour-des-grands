import assert from "node:assert/strict"
import { test } from "node:test"
import { VOTE_COLOR, type View } from "../view/view.ts"
import { AGE_COLOR, DEFAULT_VIEW, FEATURES, GROUP, GROUP_COLOR, GROUP_COLUMNS, readerOf, SCRUTIN, VOTE_COLUMNS, VOTE_RINGS } from "./fixtures.test.ts"
import { activeRowScroll, tabsOf, type Tabs } from "./bar.ts"
import { panelRows, type LayoutOffer, type Row } from "./rows.ts"

const ROWS = panelRows({ features: FEATURES, first: GROUP.key, reading: readerOf([]), chosen: { number: 8427 }, votes: null })

export function singleTab(row: Row, offer: LayoutOffer): Tabs {
  // @ts-expect-error tabs offer at least two forms
  return { row, offers: [offer] }
}

const tabbed = (view: View) => {
  const tabs = tabsOf(ROWS, view)
  return tabs && [tabs.row.name, tabs.offers.map(offer => offer.label)]
}

test("the bar shows the forms of the row holding the layout, whatever the colour, and none when that row offers a single form", () => {
  assert.deepEqual(tabbed({ scrutin: SCRUTIN, color: GROUP_COLOR, layout: VOTE_COLUMNS }), ["Vote sur un scrutin", ["Colonnes", "Demi-anneaux"]])
  assert.deepEqual(tabbed({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: VOTE_RINGS }), ["Vote sur un scrutin", ["Colonnes", "Demi-anneaux"]])
  assert.deepEqual(tabbed({ scrutin: SCRUTIN, color: AGE_COLOR, layout: VOTE_RINGS }), ["Vote sur un scrutin", ["Colonnes", "Demi-anneaux"]])
  assert.equal(tabbed(DEFAULT_VIEW), null)
  assert.equal(tabbed({ scrutin: null, color: GROUP_COLOR, layout: GROUP_COLUMNS }), null)
  assert.equal(tabbed({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: GROUP_COLUMNS }), null)
  assert.equal(tabsOf([], DEFAULT_VIEW), null)
})

test("the sheet opens with the active row at its bottom and the rows before it above, and a row taller than the sheet shows its top", () => {
  assert.equal(activeRowScroll({ top: 400, height: 90 }, 300), 190)
  assert.equal(activeRowScroll({ top: 50, height: 90 }, 300), 0)
  assert.equal(activeRowScroll({ top: 210, height: 90 }, 300), 0)
  assert.equal(activeRowScroll({ top: 400, height: 350 }, 300), 400)
})
