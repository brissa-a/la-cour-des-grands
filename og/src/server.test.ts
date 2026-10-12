import assert from "node:assert/strict"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { request, type IncomingHttpHeaders } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { brotliDecompressSync, gunzipSync } from "node:zlib"
import { viewHash } from "./canonical.ts"
import { openDiskCache } from "./disk.ts"
import { DATA, NEW as CURRENT, OLD as OLDER, ORIGIN, viewOf } from "./fixture.test.ts"
import { createImages, type Images, type RenderLine } from "./images.ts"
import { renderQueue, type QueueLimits } from "./queue.ts"
import type { Release, Releases } from "./releases.ts"
import type { CaptureTarget } from "./renderer.ts"
import { createService } from "./server.ts"
import { loadSite } from "./site.ts"
import { parseTemplate } from "./tags.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-server-"))
after(() => rm(scratch, { recursive: true, force: true }))
const dist = join(scratch, "dist")
await mkdir(join(dist, "assets"), { recursive: true })
await copyFile(new URL("../../web/index.html", import.meta.url), join(dist, "index.html"))
const SCRIPT = "console.log('lcdg')\n".repeat(40)
await writeFile(join(dist, "assets", "index-Dha1ylb_.js"), SCRIPT)
await writeFile(join(dist, "logo-gris.png"), "PNG")
await writeFile(join(scratch, "secret.txt"), "secret")
const SITE = await loadSite(dist)

const CURRENT_RELEASE: Release = { version: CURRENT, data: DATA }
const READY: Releases = { kind: "ready", current: CURRENT_RELEASE, previous: { version: OLDER, data: DATA } }
const FALLBACK = Buffer.from("generic image")
const CRAWLER = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
const RENDER_MS = 20

type Behaviour = "draw" | "fail" | "hang"

type Options = {
  readonly behaviour?: Behaviour
  readonly limits?: QueueLimits
  readonly waitMs?: number
  readonly releases?: () => Releases
  readonly fallback?: Buffer | null
}

type Running = { readonly port: number; readonly renders: CaptureTarget[]; readonly lines: RenderLine[]; readonly errors: unknown[]; readonly images: Images }

const RENDER_CLOCK_MS = 1_234

async function startService({ behaviour = "draw", limits = { concurrency: 1, capacity: 4, timeoutMs: 12_000 }, waitMs = 8_000, releases = () => READY, fallback = FALLBACK }: Options = {}): Promise<Running> {
  const renders: CaptureTarget[] = []
  const lines: RenderLine[] = []
  const errors: unknown[] = []
  const hanging: (() => void)[] = []
  const cache = await openDiskCache(await mkdtemp(join(scratch, "cache-")), 1_000_000, () => CURRENT)
  let clock = 10_000
  const render = (target: CaptureTarget, signal: AbortSignal) => {
    renders.push(target)
    clock += RENDER_CLOCK_MS
    switch (behaviour) {
      case "draw":
        return new Promise<Buffer>(resolve => setTimeout(() => resolve(Buffer.from(`jpeg of ${target.version.slice(0, 1)} ${target.query}`)), RENDER_MS))
      case "fail":
        return Promise.reject(new Error('the capture page reported data-drawing="error"'))
      case "hang":
        return new Promise<Buffer>((_, reject) => {
          hanging.push(() => reject(new Error("released")))
          signal.addEventListener("abort", () => reject(new Error("aborted")))
        })
    }
  }
  const images = createImages({ releases, cache, queue: renderQueue<Buffer>(limits), render, waitMs, log: line => lines.push(line), now: () => clock })
  const server = createService({
    site: SITE,
    template: parseTemplate(SITE.index),
    origin: ORIGIN,
    releases,
    images,
    fallback: () => fallback,
    health: () => ({ status: "ok" }),
    logError: error => errors.push(error),
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  after(() => {
    for (const release of hanging) release()
    server.close()
  })
  const address = server.address()
  assert.ok(address !== null && typeof address === "object")
  return { port: address.port, renders, lines, errors, images }
}

type Answer = { readonly status: number; readonly headers: IncomingHttpHeaders; readonly body: Buffer }

function raw(port: number, path: string, method = "GET", headers: Readonly<Record<string, string>> = {}): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const sent = request({ host: "127.0.0.1", port, path, method, headers }, response => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }))
    })
    sent.on("error", reject)
    sent.end()
  })
}

function ogImagePath(html: string): string {
  const image = /<meta property="og:image" content="([^"]+)" \/>/.exec(html)?.[1] ?? ""
  return image.replaceAll("&amp;", "&").slice(ORIGIN.length)
}

async function imagePathOf(port: number, search: string): Promise<string> {
  return ogImagePath((await raw(port, `/?${search}`)).body.toString())
}

const settle = () => new Promise(resolve => setTimeout(resolve, RENDER_MS * 3))

const drawing = await startService()

test("a shared link in canonical form gets the page with its view's tags; any other form is sent there with a 301", async () => {
  const page = await raw(drawing.port, "/?vote=VTANR5L17V1&color=vote&deputy=PA720892")
  assert.equal(page.status, 200)
  assert.equal(page.headers["content-type"], "text/html; charset=utf-8")
  assert.equal(page.headers["cache-control"], "public, max-age=60")
  const html = page.body.toString()
  assert.match(html, /<head>\s*<meta charset="utf-8" \/>\s*<meta property="og:title" content="Mathilde Panot · La motion de censure/)
  assert.ok(html.includes('<meta property="og:url" content="https://lcdg.kxv.fr/?vote=VTANR5L17V1&amp;color=vote&amp;deputy=PA720892" />'))
  assert.match(ogImagePath(html), /^\/og\/2{40}\/[0-9a-f]{64}\.jpg\?vote=VTANR5L17V1&color=vote&deputy=PA720892$/)
  const moved = await raw(drawing.port, "/?deputy=PA720892&vote=VTANR5L17V1&utm_source=mastodon")
  assert.deepEqual([moved.status, moved.headers.location, moved.headers["cache-control"], moved.body.length], [301, "/?vote=VTANR5L17V1&color=vote&deputy=PA720892", "public, max-age=60", 0])
  const index = await raw(drawing.port, "/index.html")
  assert.deepEqual([index.status, index.headers.location], [301, "/"])
})

test("a request target over 2048 bytes answers 414, a method other than GET or HEAD 405, a target not starting with / 400, as plain uncached text", async () => {
  const prefix = "/?vote=VTANR5L17V1&x="
  assert.equal((await raw(drawing.port, prefix + "a".repeat(2048 - prefix.length))).status, 301)
  const long = await raw(drawing.port, prefix + "a".repeat(2049 - prefix.length))
  assert.deepEqual([long.status, long.body.toString()], [414, "Adresse trop longue\n"])
  const posted = await raw(drawing.port, "/", "POST")
  assert.deepEqual([posted.status, posted.headers.allow, posted.body.toString()], [405, "GET, HEAD", "Méthode non permise\n"])
  const star = await raw(drawing.port, "*")
  assert.deepEqual([star.status, star.body.toString()], [400, "Adresse invalide\n"])
  for (const answer of [long, posted, star]) {
    assert.deepEqual(
      [answer.headers["content-type"], answer.headers["cache-control"], answer.headers["content-encoding"], answer.headers.vary, answer.headers["x-content-type-options"]],
      ["text/plain; charset=utf-8", "no-store", undefined, undefined, "nosniff"],
    )
  }
})

test("a page's image is drawn once however many ask at the same time, then served from the disk cache, immutable", async () => {
  const path = await imagePathOf(drawing.port, "vote=VTANR5L17V242&color=vote")
  const before = drawing.renders.length
  const answers = await Promise.all([raw(drawing.port, path), raw(drawing.port, path), raw(drawing.port, path, "HEAD")])
  assert.equal(drawing.renders.length - before, 1)
  assert.deepEqual(drawing.renders.at(-1), { version: CURRENT, query: "vote=VTANR5L17V242&color=vote" })
  const jpeg = "jpeg of 2 vote=VTANR5L17V242&color=vote"
  for (const answer of answers) {
    assert.deepEqual(
      [answer.status, answer.headers["content-type"], answer.headers["cache-control"], answer.headers["content-length"], answer.headers["x-content-type-options"]],
      [200, "image/jpeg", "public, max-age=31536000, immutable", String(jpeg.length), "nosniff"],
    )
  }
  assert.deepEqual(
    answers.map(answer => answer.body.toString()),
    [jpeg, jpeg, ""],
  )
  assert.equal((await raw(drawing.port, path)).body.toString(), jpeg)
  assert.equal(drawing.renders.length - before, 1)
})

test("two different views asked at the same time each get their own image", async () => {
  const [first, second] = await Promise.all([imagePathOf(drawing.port, "deputy=PA720892&showPic=true"), imagePathOf(drawing.port, "vote=VTANR5L17V1&color=vote&showPic=true")])
  const answers = await Promise.all([raw(drawing.port, first), raw(drawing.port, second)])
  assert.deepEqual(
    answers.map(answer => answer.body.toString()),
    ["jpeg of 2 deputy=PA720892&showPic=true", "jpeg of 2 vote=VTANR5L17V1&color=vote&showPic=true"],
  )
})

test("each render is logged once with its time, version and view, and a failed one with its reason", async () => {
  await raw(drawing.port, await imagePathOf(drawing.port, "chart=deputies%2Finit.csv%3Aage"))
  assert.deepEqual(
    drawing.lines.filter(({ query }) => query === "chart=deputies%2Finit.csv%3Aage"),
    [{ version: CURRENT, query: "chart=deputies%2Finit.csv%3Aage", ms: RENDER_CLOCK_MS, outcome: "image" }],
  )
  const failing = await startService({ behaviour: "fail" })
  await raw(failing.port, await imagePathOf(failing.port, "vote=VTANR5L17V1&color=vote"))
  assert.deepEqual(failing.lines, [{ version: CURRENT, query: "vote=VTANR5L17V1&color=vote", ms: RENDER_CLOCK_MS, outcome: "failed", reason: 'the capture page reported data-drawing="error"' }])
  const stuck = await startService({ behaviour: "hang", limits: { concurrency: 1, capacity: 1, timeoutMs: 30 }, waitMs: 1_000 })
  await raw(stuck.port, await imagePathOf(stuck.port, "deputy=PA720892"))
  assert.deepEqual(stuck.lines, [{ version: CURRENT, query: "deputy=PA720892", ms: RENDER_CLOCK_MS, outcome: "timeout", reason: "aborted" }])
})

test("an image of the previous data version is still drawn, with that version; an older version moves to the current one; a hash not matching its query is not found", async () => {
  const path = await imagePathOf(drawing.port, "showPic=true")
  const [file = "", query = ""] = path.split("?")
  const previous = await raw(drawing.port, `${file.replace(CURRENT, OLDER)}?${query}`)
  assert.deepEqual([previous.status, previous.body.toString()], [200, "jpeg of 1 showPic=true"])
  const older = await raw(drawing.port, `${file.replace(CURRENT, "3".repeat(40))}?${query}`)
  assert.deepEqual([older.status, older.headers.location, older.headers["cache-control"]], [302, path, "no-store"])
  const wrong = await raw(drawing.port, `${file}?showPic=false`)
  assert.deepEqual([wrong.status, wrong.body.toString()], [404, "Image introuvable\n"])
  assert.equal((await raw(drawing.port, file)).status, 404)
  const alone = await startService({ releases: () => ({ kind: "ready", current: CURRENT_RELEASE, previous: null }) })
  const moved = await raw(alone.port, `${file.replace(CURRENT, OLDER)}?${query}`)
  assert.deepEqual([moved.status, moved.headers.location], [302, path])
  const current = await raw(alone.port, path)
  assert.deepEqual([current.status, current.body.toString()], [200, "jpeg of 2 showPic=true"])
})

test("a crawler fetching a page gets its image drawn ahead, unless the page names no drawable view; a browser does not", async () => {
  const before = drawing.renders.length
  await raw(drawing.port, "/?deputy=PA720614", "GET", { "user-agent": CRAWLER })
  await settle()
  assert.deepEqual(drawing.renders.slice(before), [{ version: CURRENT, query: "deputy=PA720614" }])
  await raw(drawing.port, "/?deputy=PA720614", "GET", { "user-agent": CRAWLER })
  await raw(drawing.port, "/?deputy=PA720614&showPic=true", "GET", { "user-agent": "Mozilla/5.0 Firefox/140.0" })
  const unknown = await raw(drawing.port, "/?vote=VTANR5L17V999999&color=vote", "GET", { "user-agent": CRAWLER })
  assert.equal(unknown.status, 200)
  await settle()
  assert.equal(drawing.renders.length - before, 1)
})

test("a view the data cannot draw, or asked before the first data version, gets the generic image with a short cache and no render", async () => {
  const before = drawing.renders.length
  const { query } = viewOf("vote=VTANR5L17V999999&color=vote")
  const unknown = await raw(drawing.port, `/og/${CURRENT}/${viewHash(query)}.jpg?${query}`)
  assert.deepEqual([unknown.status, unknown.headers["cache-control"], unknown.body.toString()], [200, "public, max-age=60", "generic image"])
  assert.equal(drawing.renders.length, before)
  const starting = await startService({ releases: () => ({ kind: "starting" }) })
  const early = await raw(starting.port, `/og/${CURRENT}/${"a".repeat(64)}.jpg`)
  assert.deepEqual([early.status, early.body.toString()], [200, "generic image"])
  assert.equal(starting.renders.length, 0)
})

test("a failed render gets the generic image with a short cache, so the network can ask again", async () => {
  const failing = await startService({ behaviour: "fail" })
  const answer = await raw(failing.port, await imagePathOf(failing.port, "vote=VTANR5L17V1&color=vote"), "GET", { "user-agent": CRAWLER })
  assert.deepEqual([answer.status, answer.headers["content-type"], answer.headers["cache-control"], answer.body.toString()], [200, "image/jpeg", "public, max-age=60", "generic image"])
})

test("a crawler is never answered 429: a full queue or a render too slow to wait for gives it the generic image", async () => {
  const stuck = await startService({ behaviour: "hang", limits: { concurrency: 1, capacity: 0, timeoutMs: 12_000 }, waitMs: 100 })
  const first = await imagePathOf(stuck.port, "vote=VTANR5L17V1&color=vote")
  const second = await imagePathOf(stuck.port, "vote=VTANR5L17V242&color=vote")
  const [late, busy] = await Promise.all([raw(stuck.port, first, "GET", { "user-agent": CRAWLER }), raw(stuck.port, second, "GET", { "user-agent": CRAWLER })])
  for (const answer of [late, busy]) assert.deepEqual([answer.status, answer.headers["cache-control"], answer.body.toString()], [200, "public, max-age=60", "generic image"])
  assert.equal(stuck.renders.length, 1)
})

test("the generic image is served at its own address, and while none exists yet the image addresses answer 503 to try again later", async () => {
  const generic = await raw(drawing.port, "/og/fallback.jpg")
  assert.deepEqual([generic.status, generic.headers["content-type"], generic.headers["cache-control"], generic.body.toString()], [200, "image/jpeg", "public, max-age=60", "generic image"])
  const bare = await startService({ behaviour: "fail", fallback: null })
  for (const path of ["/og/fallback.jpg", await imagePathOf(bare.port, "deputy=PA720892")]) {
    const answer = await raw(bare.port, path)
    assert.deepEqual([answer.status, answer.headers["retry-after"], answer.headers["cache-control"], answer.body.toString()], [503, "30", "no-store", "Image indisponible, réessayez plus tard\n"])
  }
})

test("the generic image is drawn from the default view, waiting as long as the render takes, and is missing when the render fails", async () => {
  const patient = await startService({ waitMs: 1 })
  assert.equal((await patient.images.image(CURRENT_RELEASE, viewOf("")))?.toString(), "jpeg of 2 ")
  const failing = await startService({ behaviour: "fail" })
  assert.equal(await failing.images.image(CURRENT_RELEASE, viewOf("")), null)
})

test("the build's files are served by their exact path, compressed when the client accepts it; a path that climbs out of the build or names no file is 404", async () => {
  const br = await raw(drawing.port, "/assets/index-Dha1ylb_.js", "GET", { "accept-encoding": "gzip, br" })
  assert.deepEqual([br.status, br.headers["content-encoding"], br.headers.vary, br.headers["cache-control"]], [200, "br", "Accept-Encoding", "public, max-age=31536000, immutable"])
  assert.equal(brotliDecompressSync(br.body).toString(), SCRIPT)
  const gzip = await raw(drawing.port, "/assets/index-Dha1ylb_.js?v=1", "GET", { "accept-encoding": "gzip" })
  assert.equal(gunzipSync(gzip.body).toString(), SCRIPT)
  const plain = await raw(drawing.port, "/assets/index-Dha1ylb_.js")
  assert.deepEqual([plain.headers["content-encoding"], plain.body.toString()], [undefined, SCRIPT])
  const logo = await raw(drawing.port, "/logo-gris.png", "GET", { "accept-encoding": "br" })
  assert.deepEqual([logo.headers["content-type"], logo.headers["content-encoding"], logo.headers.vary, logo.headers["cache-control"], logo.body.toString()], ["image/png", undefined, undefined, "public, max-age=3600", "PNG"])
  for (const path of ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/../secret.txt", "/assets/../../secret.txt", "//secret.txt", "/assets/", "/secret.txt", "/assets/index-Dha1ylb_.js/"]) {
    const missing = await raw(drawing.port, path)
    assert.deepEqual([missing.status, missing.body.toString()], [404, "Page introuvable\n"], path)
  }
  for (const path of ["/assets/../index.html", "/assets/%2e%2e/index.html"]) assert.deepEqual([(await raw(drawing.port, path)).headers.location], ["/"], path)
})

test("the page is compressed for clients that accept it, and the health check answers JSON for Docker", async () => {
  const br = await raw(drawing.port, "/", "GET", { "accept-encoding": "br" })
  assert.deepEqual([br.headers["content-encoding"], br.headers.vary], ["br", "Accept-Encoding"])
  assert.match(brotliDecompressSync(br.body).toString(), /<meta property="og:url" content="https:\/\/lcdg\.kxv\.fr\/" \/>/)
  const gzip = await raw(drawing.port, "/", "GET", { "accept-encoding": "gzip" })
  assert.match(gunzipSync(gzip.body).toString(), /<meta property="og:url" content="https:\/\/lcdg\.kxv\.fr\/" \/>/)
  const health = await raw(drawing.port, "/healthz")
  assert.deepEqual([health.status, health.headers["content-type"], health.headers["cache-control"], JSON.parse(health.body.toString())], [200, "application/json", "no-store", { status: "ok" }])
})

test("an unexpected failure answers 500 and is logged", async () => {
  const broken = await startService({
    releases: () => {
      throw new Error("state lost")
    },
  })
  const answer = await raw(broken.port, "/")
  assert.deepEqual([answer.status, answer.body.toString()], [500, "Erreur interne\n"])
  assert.deepEqual(broken.errors, [new Error("state lost")])
})
