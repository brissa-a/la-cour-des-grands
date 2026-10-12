import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { DATA, ORIGIN, SHA } from "./fixture.test.ts"
import { answerPage, type PageAnswer } from "./page.ts"
import type { Releases } from "./releases.ts"
import { parseTemplate } from "./tags.ts"

const TEMPLATE = parseTemplate(readFileSync(new URL("../../web/index.html", import.meta.url), "utf8"))
const READY: Releases = { kind: "ready", current: { version: SHA, data: DATA }, previous: null }

function answer(rawQuery: string | null, releases = READY): PageAnswer {
  return answerPage(rawQuery, releases, TEMPLATE, ORIGIN)
}

function page(rawQuery: string | null): string {
  const answered = answer(rawQuery)
  assert.ok(answered.kind === "page", `${rawQuery ?? "no query"} should be served`)
  return answered.html
}

function tag(html: string, key: string): string | undefined {
  return new RegExp(`<meta property="${key}" content="([^"]*)" />`).exec(html)?.[1]
}

test("a link in canonical form is served with its own full URL and its versioned image", () => {
  const html = page("vote=VTANR5L17V1&color=vote&deputy=PA720892")
  assert.equal(tag(html, "og:url"), "https://lcdg.kxv.fr/?vote=VTANR5L17V1&amp;color=vote&amp;deputy=PA720892")
  assert.match(tag(html, "og:image") ?? "", /^https:\/\/lcdg\.kxv\.fr\/og\/d14b3767011d709e9565eeab3af97ca1ad57650a\/[0-9a-f]{64}\.jpg\?vote=VTANR5L17V1&amp;color=vote&amp;deputy=PA720892$/)
  assert.equal(tag(html, "og:title"), "Mathilde Panot · La motion de censure déposée par M. Boris Vallaud, Mme Mathilde Panot et 188 de leurs collègues.")
  assert.equal(tag(page(null), "og:url"), "https://lcdg.kxv.fr/")
})

test("a link in another order, with defaults, unknown parameters or an empty query is sent once to its canonical form, which is then served", () => {
  const cases: readonly (readonly [string | null, string])[] = [
    ["deputy=PA720892&vote=VTANR5L17V1", "/?vote=VTANR5L17V1&color=vote&deputy=PA720892"],
    ["vote=VTANR5L17V1&color=vote&deputy=PA720892&fbclid=abc", "/?vote=VTANR5L17V1&color=vote&deputy=PA720892"],
    ["color=deputies/init.csv:group&layout=hemicycle&showPic=false", "/"],
    ["", "/"],
    ["deputy=PA0&title=true", "/"],
    ["clean=true&vote=VTANR5L17V242", "/?vote=VTANR5L17V242&color=vote&clean=true"],
    ["title=true&clean=true", "/?clean=true&title=true"],
    ["clean=capture&title=true&showPic=true", "/?showPic=true&clean=capture"],
  ]
  for (const [rawQuery, location] of cases) {
    assert.deepEqual(answer(rawQuery), { kind: "redirect", location }, rawQuery ?? "no query")
    page(location === "/" ? null : location.slice(2))
  }
})

test("an embed or capture link keeps its switch, while its tags point at the full site's view", () => {
  const html = page("vote=VTANR5L17V242&color=vote&clean=true&title=true")
  assert.equal(tag(html, "og:url"), "https://lcdg.kxv.fr/?vote=VTANR5L17V242&amp;color=vote")
  assert.match(tag(html, "og:image") ?? "", /\.jpg\?vote=VTANR5L17V242&amp;color=vote$/)
})

test("a scrutin the data does not hold gets the generic image and is not drawn ahead", () => {
  const answered = answer("vote=VTANR5L17V999999&color=vote")
  assert.ok(answered.kind === "page")
  assert.equal(tag(answered.html, "og:image"), "https://lcdg.kxv.fr/og/fallback.jpg")
  assert.equal(answered.prerender, null)
  const known = answer("vote=VTANR5L17V1&color=vote")
  assert.ok(known.kind === "page")
  assert.equal(known.prerender?.view.query, "vote=VTANR5L17V1&color=vote")
})

test("before the first data version is known, any link gets the page with its static tags and no redirect", () => {
  assert.deepEqual(answer("utm_source=x&vote=VTANR5L17V1", { kind: "starting" }), { kind: "page", html: TEMPLATE.plain, prerender: null })
})
