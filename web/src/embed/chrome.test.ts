import assert from "node:assert/strict"
import { test } from "node:test"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { deputyId } from "../data/deputyId.ts"
import { VOTE } from "../sources/shapes.ts"
import { HEMICYCLE, viewParams, VOTE_COLOR } from "../view/view.ts"
import { voteId } from "../votes/voteId.ts"
import { chromeParams, embedUrl, fullSiteUrl, legendShown, parseChrome, stageClearance, stageInput, type Chrome } from "./chrome.ts"

const GROUP: CategoryFeature = { kind: "category", key: "deputies/init.csv:group", file: "deputies/init.csv", column: "group", title: "Groupe politique", values: "g" }
const AGE: NumberFeature = { kind: "number", key: "deputies/init.csv:age", file: "deputies/init.csv", column: "age", title: "Âge" }
const SCRUTIN = voteId("VTANR5L17V8427")
assert.ok(SCRUTIN)

const FULL: Chrome = { kind: "full" }
const CLEAN: Chrome = { kind: "clean", title: false }
const CAPTURE: Chrome = { kind: "capture" }

function chromeOf(search: string): Chrome {
  const params = new URLSearchParams(search)
  return parseChrome(name => params.get(name))
}

test("clean=true strips the interface, clean=capture strips it for the preview image, and the vote title line comes only with the first and only from title=true", () => {
  assert.deepEqual(chromeOf(""), FULL)
  assert.deepEqual(chromeOf("?clean=true"), CLEAN)
  assert.deepEqual(chromeOf("?vote=VTANR5L17V8427&clean=true&title=true"), { kind: "clean", title: true })
  assert.deepEqual(chromeOf("?clean=true&title=1"), CLEAN)
  assert.deepEqual(chromeOf("?clean=capture"), CAPTURE)
  assert.deepEqual(chromeOf("?clean=capture&title=true"), CAPTURE)
  assert.deepEqual(chromeOf("?title=true"), FULL)
  assert.deepEqual(chromeOf("?clean=false&title=true"), FULL)
  assert.deepEqual(chromeOf("?clean=1"), FULL)
  assert.deepEqual(chromeOf("?clean=Capture"), FULL)
})

test("the parameters written for a chrome read back as that chrome, and the full site writes none", () => {
  for (const chrome of [FULL, CLEAN, { kind: "clean", title: true } as const, CAPTURE]) {
    const params = new URLSearchParams()
    for (const [name, value] of chromeParams(chrome)) if (value !== null) params.append(name, value)
    assert.deepEqual(chromeOf(params.toString()), chrome)
  }
  assert.deepEqual(chromeParams(FULL), [])
})

test("only the full site pans and zooms, the embed takes taps, and the capture takes no input", () => {
  assert.deepEqual([FULL, CLEAN, CAPTURE].map(stageInput), ["panZoom", "tap", "none"])
})

test("the capture keeps the site's side clearance around the chart and lends part of the top and bottom one to its height", () => {
  const site = stageClearance(FULL)
  assert.deepEqual(stageClearance(CLEAN), site)
  assert.equal(stageClearance(CAPTURE).x, site.x)
  assert.ok(stageClearance(CAPTURE).y < site.y)
})

test("a link out of the embed opens the full site on the same view, without the embed parameters, on the deputy when one is given", () => {
  const embed = "https://example.fr/?clean=true&title=true&vote=VTANR5L17V8427&showPic=true&utm=x#top"
  const view = [...viewParams({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: { form: "columns", picks: { main: AGE } } }, GROUP.key), ["showPic", "true"] as const]
  assert.equal(fullSiteUrl(embed, view, null), "https://example.fr/?vote=VTANR5L17V8427&color=vote&chart=deputies%2Finit.csv%3Aage&showPic=true")
  assert.equal(fullSiteUrl(embed, view, deputyId("PA1")), "https://example.fr/?vote=VTANR5L17V8427&color=vote&chart=deputies%2Finit.csv%3Aage&showPic=true&deputy=PA1")
  assert.equal(fullSiteUrl("https://example.fr/carte/?clean=true", viewParams({ scrutin: null, color: { paint: "palette", of: GROUP }, layout: HEMICYCLE }, GROUP.key), null), "https://example.fr/carte/")
})

test("the embed address opens the same view in the clean chrome, without the vote title line", () => {
  const view = viewParams({ scrutin: SCRUTIN, color: VOTE_COLOR, layout: HEMICYCLE }, GROUP.key)
  const src = embedUrl("https://example.fr/?vote=VTANR5L17V8427&color=vote&deputy=PA1&title=true", view)
  assert.equal(src, "https://example.fr/?vote=VTANR5L17V8427&color=vote&clean=true")
  assert.deepEqual(chromeOf(new URL(src).search), CLEAN)
})

test("the embed, which has no vote header, keeps the legend of every colour, the vote's too unless the layout already names the vote's parts", () => {
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
  assert.equal(legendShown(CLEAN, GROUP, { form: "columns", picks: { main: GROUP } }), true)
  assert.equal(legendShown({ kind: "clean", title: true }, VOTE, { form: "columns", picks: { main: VOTE } }), false)
})

test("the preview image leaves the legend out only when the layout already names the colour's own parts", () => {
  const byVote = { form: "halfRings", picks: { main: VOTE } } as const
  const byAge = { form: "columns", picks: { main: AGE } } as const
  const byGroup = { form: "columns", picks: { main: GROUP } } as const
  assert.deepEqual([legendShown(CAPTURE, VOTE, HEMICYCLE), legendShown(CAPTURE, VOTE, byAge), legendShown(CAPTURE, GROUP, byVote), legendShown(CAPTURE, AGE, byGroup)], [true, true, true, true])
  assert.deepEqual([legendShown(CAPTURE, VOTE, byVote), legendShown(CAPTURE, GROUP, byGroup), legendShown(CAPTURE, AGE, byAge)], [false, false, false])
})
