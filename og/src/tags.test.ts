import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { escapeHtml, pageHtml, parseTemplate, type PreviewTags } from "./tags.ts"

const INDEX = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8")

const TAGS: PreviewTags = {
  title: "Mathilde Panot · la motion de censure",
  description: "Motion de censure du 8 octobre 2024 · Rejeté",
  url: "https://lcdg.kxv.fr/?vote=VTANR5L17V1&color=vote",
  image: "https://lcdg.kxv.fr/og/d14b3767011d709e9565eeab3af97ca1ad57650a/ab.jpg?vote=VTANR5L17V1&color=vote",
  imageAlt: "Vote en couleur · Siège en hémicycle",
}

function headOf(html: string): string {
  return html.slice(html.indexOf("<head>"), html.indexOf("</head>"))
}

function metaContents(html: string, key: string): string[] {
  return [...html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)" \/>/g)].filter(([, found]) => found === key).map(([, , content = ""]) => content)
}

test("text that would close an attribute or open a tag is written as entities", () => {
  assert.equal(escapeHtml(`"/><script>alert('x')</script> & co`), "&quot;/&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; co")
})

test("the page head starts, after the charset, with the view's tags, which replace the static ones once each", () => {
  const html = pageHtml(parseTemplate(INDEX), TAGS)
  const head = headOf(html)
  assert.match(head, /^<head>\s*<meta charset="utf-8" \/>\s*<meta property="og:title" content="Mathilde Panot · la motion de censure" \/>/)
  const keys = [...head.matchAll(/<meta (?:property|name)="([^"]+)"/g)].map(([, key]) => key)
  assert.deepEqual(keys, [
    "og:title",
    "og:description",
    "og:url",
    "og:image",
    "og:image:width",
    "og:image:height",
    "og:image:type",
    "og:image:alt",
    "og:type",
    "og:site_name",
    "og:locale",
    "twitter:card",
    "description",
    "viewport",
    "theme-color",
  ])
  assert.deepEqual(metaContents(head, "og:image"), ["https://lcdg.kxv.fr/og/d14b3767011d709e9565eeab3af97ca1ad57650a/ab.jpg?vote=VTANR5L17V1&amp;color=vote"])
  assert.deepEqual(
    ["og:image:width", "og:image:height", "og:image:type", "twitter:card", "og:locale", "og:site_name"].map(key => metaContents(head, key)),
    [["1200"], ["630"], ["image/jpeg"], ["summary_large_image"], ["fr_FR"], ["La cour des grands"]],
  )
  assert.deepEqual(metaContents(head, "og:type"), ["website"])
  assert.equal(head.replaceAll(/<[^>]*>/g, "").trim(), "LCDG - La cour des grands")
  assert.doesNotMatch(head, /\n\s*\n/)
  assert.deepEqual([...head.matchAll(/<link rel="canonical" href="([^"]*)" \/>/g)].map(([, href]) => href), ["https://lcdg.kxv.fr/?vote=VTANR5L17V1&amp;color=vote"])
  assert.deepEqual(metaContents(head, "description"), metaContents(head, "og:description"))
  assert.equal(html.replace(head, ""), INDEX.replace(headOf(INDEX), ""))
  assert.ok(head.includes('<link rel="icon" href="/logo-philo-blanc.png" media="(prefers-color-scheme: dark)" />') && head.includes("<title>LCDG - La cour des grands</title>"))
})

test("a hostile vote title stays inside its attribute", () => {
  const head = headOf(pageHtml(parseTemplate(INDEX), { ...TAGS, title: `x" /><script>alert(1)</script><meta name="y` }))
  assert.equal(head.includes("<script>"), false)
  assert.deepEqual(metaContents(head, "og:title"), ["x&quot; /&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;meta name=&quot;y"])
  assert.deepEqual(metaContents(head, "y"), [])
})

test("an index.html without a utf-8 charset declaration is refused at start", () => {
  assert.throws(() => parseTemplate("<!doctype html><html><head><title>x</title></head></html>"), /index\.html: no <meta charset="utf-8" \/>/)
})
