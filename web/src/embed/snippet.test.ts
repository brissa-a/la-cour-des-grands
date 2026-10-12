import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULT_VIEW, SCRUTIN, VOTE_COLUMNS } from "../panel/fixtures.test.ts"
import { VOTE_COLOR } from "../view/view.ts"
import { embedCode, embedTitle } from "./snippet.ts"

test("the embed code frames the clean view at full width and a fixed height, borderless, loaded when scrolled to, with its attributes escaped", () => {
  assert.equal(
    embedCode("https://example.fr/carte/?deputy=PA1#top", [["vote", "VTANR5L17V8427"], ["color", null], ["chart", "deputies/init.csv:age"]], `Âge & "région" <b>`),
    '<iframe src="https://example.fr/carte/?vote=VTANR5L17V8427&amp;chart=deputies%2Finit.csv%3Aage&amp;clean=true" title="Âge &amp; &quot;région&quot; &lt;b&gt;" loading="lazy" style="width: 100%; height: 480px; border: 0"></iframe>',
  )
})

test("the embed frame is named after the site, then the colour and the layout of the view, with the chosen vote", () => {
  assert.equal(embedTitle(DEFAULT_VIEW, null), "La cour des grands · Groupe politique en couleur · Siège en hémicycle")
  assert.equal(embedTitle({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: VOTE_COLUMNS }, { number: 8427 }), "La cour des grands · Vote n° 8427 en couleur · Vote n° 8427 en colonnes")
})
