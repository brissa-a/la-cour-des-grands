import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { jpegSize } from "./jpeg.ts"

const ORIGIN = process.env["LIVE_ORIGIN"] ?? "https://lcdg.kxv.fr"

const CRAWLERS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "WhatsApp/2.23.20.0",
  "Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)",
  "http.rb/5.1.1 (Mastodon/4.3.0; +https://mastodon.social/)",
] as const

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

const VIEWS = [
  { name: "the default view", query: "" },
  { name: "a vote", query: "vote=VTANR5L17V8427&color=vote" },
  { name: "a deputy", query: "deputy=PA720892" },
] as const

const UNKNOWN_VOTE = "vote=VTANR5L17V999999&color=vote"

const IMMUTABLE = "public, max-age=31536000, immutable"

const pageUrl = (query: string) => (query === "" ? `${ORIGIN}/` : `${ORIGIN}/?${query}`)

const unescapeHtml = (text: string) => text.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")

function tag(html: string, key: string): string {
  const content = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)" />`).exec(html)?.[1]
  assert.ok(content !== undefined, `${key} in the page`)
  return unescapeHtml(content)
}

async function page(query: string, userAgent: string): Promise<string> {
  const response = await fetch(pageUrl(query), { headers: { "user-agent": userAgent }, redirect: "manual" })
  assert.equal(response.status, 200, `${pageUrl(query)} for ${userAgent}`)
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8")
  return response.text()
}

async function jpeg(url: string, cacheControl: string): Promise<{ readonly bytes: number; readonly ms: number }> {
  const started = performance.now()
  const response = await fetch(url, { headers: { "user-agent": CRAWLERS[0] }, redirect: "manual" })
  assert.equal(response.status, 200, url)
  assert.equal(response.headers.get("content-type"), "image/jpeg")
  assert.equal(response.headers.get("cache-control"), cacheControl)
  const body = Buffer.from(await response.arrayBuffer())
  assert.deepEqual(jpegSize(body), { width: 1200, height: 630 })
  return { bytes: body.length, ms: Math.round(performance.now() - started) }
}

async function health(): Promise<{ readonly data: unknown; readonly version: string }> {
  const response = await fetch(`${ORIGIN}/healthz`)
  assert.equal(response.status, 200)
  const body: unknown = await response.json()
  assert.ok(typeof body === "object" && body !== null && "data" in body && "version" in body && typeof body.version === "string", "the health check's JSON")
  return { data: body.data, version: body.version }
}

test("the service has loaded a data version", async () => {
  const { data, version } = await health()
  assert.equal(data, "ready")
  assert.match(version, /^[0-9a-f]{40}$/)
})

for (const { name, query } of VIEWS) {
  test(`every link preview crawler gets ${name}'s own tags, its og:url being the address it asked for`, async () => {
    for (const crawler of CRAWLERS) {
      const html = await page(query, crawler)
      assert.equal(tag(html, "og:url"), pageUrl(query), crawler)
      assert.ok(tag(html, "og:image").startsWith(`${ORIGIN}/og/`), crawler)
      assert.notEqual(tag(html, "og:title"), "", crawler)
      assert.equal(tag(html, "twitter:card"), "summary_large_image", crawler)
    }
  })

  test(`${name}'s og:image is a 1200x630 JPEG cached for a year`, async t => {
    const image = tag(await page(query, CRAWLERS[0]), "og:image")
    assert.ok(image.startsWith(`${ORIGIN}/og/`) && !image.startsWith(`${ORIGIN}/og/fallback`), image)
    const first = await jpeg(image, IMMUTABLE)
    const again = await jpeg(image, IMMUTABLE)
    t.diagnostic(`${image}: ${first.bytes} bytes, ${first.ms} ms then ${again.ms} ms`)
  })
}

test("a link not in canonical form is sent to it for good", async () => {
  const response = await fetch(`${ORIGIN}/?color=group&vote=VTANR5L17V8427&foo=bar`, { redirect: "manual" })
  assert.equal(response.status, 301)
  assert.equal(response.headers.get("location"), "/?vote=VTANR5L17V8427&color=vote")
})

test("a vote the data does not hold gets the generic image, cached a minute", async () => {
  assert.equal(tag(await page(UNKNOWN_VOTE, CRAWLERS[0]), "og:image"), `${ORIGIN}/og/fallback.jpg`)
  const { version } = await health()
  const hash = createHash("sha256").update(UNKNOWN_VOTE).digest("hex")
  await jpeg(`${ORIGIN}/og/${version}/${hash}.jpg?${UNKNOWN_VOTE}`, "public, max-age=60")
})

test("a request target over 2 KB is refused", async () => {
  const response = await fetch(`${ORIGIN}/?vote=${"V".repeat(2100)}`, { redirect: "manual" })
  assert.equal(response.status, 414)
})

test("a browser gets the site with its script compressed and cached for a year", async () => {
  const html = await page("", BROWSER)
  const script = /<script type="module" crossorigin src="([^"]+)"><\/script>/.exec(html)?.[1]
  assert.ok(script !== undefined, "the module script in the page")
  const response = await fetch(new URL(script, ORIGIN), { headers: { "accept-encoding": "br, gzip" } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-encoding"), "br")
  assert.equal(response.headers.get("cache-control"), IMMUTABLE)
})
