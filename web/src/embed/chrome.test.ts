import assert from "node:assert/strict"
import { test } from "node:test"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { deputyId } from "../data/deputyId.ts"
import { VOTE } from "../sources/shapes.ts"
import { HEMICYCLE, viewParams, VOTE_COLOR } from "../view/view.ts"
import { voteId } from "../votes/voteId.ts"
import { fullSiteUrl, legendShown, parseChrome, type Chrome } from "./chrome.ts"

const GROUP: CategoryFeature = { kind: "category", key: "deputies/init.csv:group", file: "deputies/init.csv", column: "group", title: "Groupe politique", values: "g" }
const AGE: NumberFeature = { kind: "number", key: "deputies/init.csv:age", file: "deputies/init.csv", column: "age", title: "Âge" }
const SCRUTIN = voteId("VTANR5L17V8427")
assert.ok(SCRUTIN)

const FULL: Chrome = { kind: "full" }
const CLEAN: Chrome = { kind: "clean", title: false }

function chromeOf(search: string): Chrome {
  const params = new URLSearchParams(search)
  return parseChrome(name => params.get(name))
}

test("only clean=true strips the interface, and the vote title line comes only with it and only from title=true", () => {
  assert.deepEqual(chromeOf(""), FULL)
  assert.deepEqual(chromeOf("?clean=true"), CLEAN)
  assert.deepEqual(chromeOf("?vote=VTANR5L17V8427&clean=true&title=true"), { kind: "clean", title: true })
  assert.deepEqual(chromeOf("?clean=true&title=1"), CLEAN)
  assert.deepEqual(chromeOf("?title=true"), FULL)
  assert.deepEqual(chromeOf("?clean=false&title=true"), FULL)
  assert.deepEqual(chromeOf("?clean=1"), FULL)
})

test("a link out of the embed opens the full site on the same view, without the embed parameters, on the deputy when one is given", () => {
  const embed = "https://example.fr/?clean=true&title=true&vote=VTANR5L17V8427&showPic=true&utm=x#top"
  const view = [...viewParams({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "columns", picks: { main: AGE } } }, GROUP.key), ["showPic", "true"] as const]
  assert.equal(fullSiteUrl(embed, view, null), "https://example.fr/?vote=VTANR5L17V8427&color=vote&chart=deputies%2Finit.csv%3Aage&showPic=true")
  assert.equal(fullSiteUrl(embed, view, deputyId("PA1")), "https://example.fr/?vote=VTANR5L17V8427&color=vote&chart=deputies%2Finit.csv%3Aage&showPic=true&deputy=PA1")
  assert.equal(fullSiteUrl("https://example.fr/carte/?clean=true", viewParams({ scrutin: null, color: { paint: "palette", of: GROUP }, layout: HEMICYCLE }, GROUP.key), null), "https://example.fr/carte/")
})

test("the legend explains the vote colours in the embed, which has no vote header, unless the layout already names the vote's parts", () => {
  const byVote = { form: "halfRings", picks: { main: VOTE } } as const
  const byAge = { form: "columns", picks: { main: AGE } } as const
  for (const chrome of [FULL, CLEAN]) {
    assert.equal(legendShown(chrome, GROUP, byVote), true)
    assert.equal(legendShown(chrome, AGE, HEMICYCLE), true)
  }
  assert.equal(legendShown(FULL, VOTE, HEMICYCLE), false)
  assert.equal(legendShown(FULL, VOTE, byAge), false)
  assert.equal(legendShown(CLEAN, VOTE, HEMICYCLE), true)
  assert.equal(legendShown(CLEAN, VOTE, byAge), true)
  assert.equal(legendShown(CLEAN, VOTE, byVote), false)
  assert.equal(legendShown({ kind: "clean", title: true }, VOTE, { form: "columns", picks: { main: VOTE } }), false)
})
