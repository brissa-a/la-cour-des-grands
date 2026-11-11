import assert from "node:assert/strict"
import { once } from "node:events"
import { copyFile, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises"
import { Agent, request, type IncomingHttpHeaders } from "node:http"
import { connect, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { brotliDecompressSync, gunzipSync } from "node:zlib"
import { renderId, viewHash } from "./canonical.ts"
import { createDataFiles } from "./dataFiles.ts"
import { openDiskCache, type DiskCache } from "./disk.ts"
import { perClientDownloads, type DownloadLimits, type Downloads } from "./downloads.ts"
import { DATA, eventually, NEW as CURRENT, OLD as OLDER, openDescriptorsOn, ORIGIN, RENDER, viewOf } from "./fixture.test.ts"
import { createImages, type Images, type RenderLine } from "./images.ts"
import { renderQueue, type QueueLimits, type RenderQueue } from "./queue.ts"
import type { Release, Releases } from "./releases.ts"
import type { CaptureTarget } from "./renderer.ts"
import { createService } from "./server.ts"
import { loadSite } from "./site.ts"
import { parseTemplate } from "./tags.ts"

const scratch = await mkdtemp(join(tmpdir(), "server-http-"))
after(() => rm(scratch, { recursive: true, force: true }))
const dist = join(scratch, "dist")
await mkdir(join(dist, "assets"), { recursive: true })
await copyFile(new URL("../../web/index.html", import.meta.url), join(dist, "index.html"))
const SCRIPT = "console.log('lcdg')\n".repeat(40)
await writeFile(join(dist, "assets", "index-Dha1ylb_.js"), SCRIPT)
await writeFile(join(dist, "logo-gris.png"), "PNG")
await writeFile(join(scratch, "secret.txt"), "secret")
const SITE = await loadSite(dist)

const DATA_ROOT = join(scratch, "data")
const SNAPSHOT = join(DATA_ROOT, "v2", CURRENT)
const VOTES = "vote_id,number\n" + "VTANR5L17V1,1\n".repeat(300)
const POINTER = `{"version":"${CURRENT}","publishedAt":"2026-11-07T04:00:00.000Z"}`
await mkdir(join(SNAPSHOT, "votes"), { recursive: true })
await mkdir(join(SNAPSHOT, "photos"))
await mkdir(join(DATA_ROOT, "v2", ".store"))
await mkdir(join(DATA_ROOT, "v2", ".runs"))
await writeFile(join(DATA_ROOT, "v2", "current.json"), POINTER)
await writeFile(join(SNAPSHOT, "votes", "votes.csv"), VOTES)
await writeFile(join(SNAPSHOT, "photos", "PA720892.webp"), "WEBP")
await writeFile(join(SNAPSHOT, ".hidden.csv"), "hidden")
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>'
await mkdir(join(SNAPSHOT, "seats"))
await writeFile(join(SNAPSHOT, "seats", "hemicycle.svg"), SVG)
for (const name of ["index.html", "seats/draw.js", "notes.txt", "README"]) await writeFile(join(SNAPSHOT, name), "<script>alert(document.domain)</script>")
await writeFile(join(DATA_ROOT, "v2", ".store", "0".repeat(64)), "stored")
await writeFile(join(DATA_ROOT, "v2", ".runs", "last.json"), "{}")
await symlink(join(scratch, "secret.txt"), join(SNAPSHOT, "secret.csv"))
await symlink(scratch, join(SNAPSHOT, "outside"))
const LARGE = Buffer.from(Array.from({ length: 3 * 1024 ** 2 + 7 }, (_, index) => (index * 7919) % 251))
await writeFile(join(SNAPSHOT, "votes", "large.csv"), LARGE)
const HUGE_BYTES = 4 * 1024 ** 3
await writeFile(join(SNAPSHOT, "votes", "huge.csv"), "")
await truncate(join(SNAPSHOT, "votes", "huge.csv"), HUGE_BYTES)

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
  readonly pointer?: string | null
  readonly fallback?: Buffer | null
  readonly disk?: "works" | "full"
  readonly downloads?: DownloadLimits
  readonly maxConnections?: number
}

type Running = {
  readonly port: number
  readonly renders: CaptureTarget[]
  readonly lines: RenderLine[]
  readonly errors: unknown[]
  readonly images: Images
  readonly queue: RenderQueue<Buffer>
  readonly downloads: Downloads
  readonly sockets: Socket[]
  readonly advance: (ms: number) => void
}

const LIMITS: QueueLimits = { concurrency: 1, capacity: 4, perClient: 4, timeoutMs: 12_000 }
const DOWNLOADS: DownloadLimits = { perClient: 64, waiting: 64, waitMs: 5_000, total: 1_000 }

function full(cache: DiskCache): DiskCache {
  return { ...cache, put: () => Promise.reject(new Error("ENOSPC: no space left on device, write")) }
}

const RENDER_CLOCK_MS = 1_234

async function startService({ behaviour = "draw", limits = LIMITS, waitMs = 8_000, releases = () => READY, pointer = POINTER, fallback = FALLBACK, disk = "works", downloads = DOWNLOADS, maxConnections = 1_000 }: Options = {}): Promise<Running> {
  const renders: CaptureTarget[] = []
  const lines: RenderLine[] = []
  const errors: unknown[] = []
  const hanging: (() => void)[] = []
  const opened = await openDiskCache(await mkdtemp(join(scratch, "cache-")), 1_000_000, RENDER, () => CURRENT)
  const cache = disk === "full" ? full(opened) : opened
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
  const queue = renderQueue<Buffer>(limits)
  const images = createImages({ releases, cache, queue, render, renderId: RENDER, waitMs, log: line => lines.push(line), now: () => clock })
  const gate = perClientDownloads(downloads)
  const server = createService({
    site: SITE,
    page: { template: parseTemplate(SITE.index), origin: ORIGIN, render: RENDER },
    releases,
    pointer: () => pointer,
    data: createDataFiles(DATA_ROOT, { keptBytes: 1_000_000, compressions: 2 }),
    downloads: gate,
    images,
    fallback: () => fallback,
    health: () => ({ status: "ok" }),
    logError: error => errors.push(error),
  }, maxConnections)
  const sockets: Socket[] = []
  server.on("connection", (socket: Socket) => sockets.push(socket))
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  // A test failing while it holds downloads open still lets the file end: server.close() alone would wait for them.
  after(() => {
    for (const release of hanging) release()
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert.ok(address !== null && typeof address === "object")
  return {
    port: address.port,
    renders,
    lines,
    errors,
    images,
    queue,
    downloads: gate,
    sockets,
    advance: ms => {
      clock += ms
    },
  }
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

function firstChunk(port: number, path: string): Promise<{ readonly status: number; readonly headers: IncomingHttpHeaders; readonly chunk: Buffer }> {
  return new Promise((resolve, reject) => {
    const sent = request({ host: "127.0.0.1", port, path, agent: false }, response => {
      response.once("data", (chunk: Buffer) => {
        resolve({ status: response.statusCode ?? 0, headers: response.headers, chunk })
        response.destroy()
      })
    })
    sent.on("error", reject)
    sent.end()
  })
}

type Held = { readonly status: number; readonly close: () => void }

function held(port: number, path: string, headers: Readonly<Record<string, string>>): Promise<Held> {
  return new Promise((resolve, reject) => {
    const sent = request({ host: "127.0.0.1", port, path, headers, agent: false }, response => {
      response.once("data", () => {
        response.pause()
        sent.removeListener("error", reject)
        sent.on("error", () => undefined)
        resolve({ status: response.statusCode ?? 0, close: () => sent.destroy() })
      })
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
  assert.equal(ogImagePath(html).replace(/[0-9a-f]{64}/, "<hash>"), `/og/${CURRENT}/${RENDER}/<hash>.jpg?vote=VTANR5L17V1&color=vote&deputy=PA720892`)
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

test("two different views asked at the same time each get their own image, drawn without photos even when the link shows them", async () => {
  const [first, second] = await Promise.all([imagePathOf(drawing.port, "deputy=PA720892&showPic=true"), imagePathOf(drawing.port, "vote=VTANR5L17V1&color=vote&showPic=true")])
  const answers = await Promise.all([raw(drawing.port, first), raw(drawing.port, second)])
  assert.deepEqual(
    answers.map(answer => answer.body.toString()),
    ["jpeg of 2 deputy=PA720892", "jpeg of 2 vote=VTANR5L17V1&color=vote"],
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
  const stuck = await startService({ behaviour: "hang", limits: { ...LIMITS, capacity: 1, timeoutMs: 30 }, waitMs: 1_000 })
  await raw(stuck.port, await imagePathOf(stuck.port, "deputy=PA720892"))
  assert.deepEqual(stuck.lines, [{ version: CURRENT, query: "deputy=PA720892", ms: RENDER_CLOCK_MS, outcome: "timeout", reason: "aborted" }])
})

test("an image of the previous data version is still drawn, with that version; an older version or render moves to the current one; a hash not matching its query is not found", async () => {
  const path = await imagePathOf(drawing.port, "deputy=PA720892")
  const [file = "", query = ""] = path.split("?")
  const previous = await raw(drawing.port, `${file.replace(CURRENT, OLDER)}?${query}`)
  assert.deepEqual([previous.status, previous.body.toString()], [200, "jpeg of 1 deputy=PA720892"])
  const older = await raw(drawing.port, `${file.replace(CURRENT, "3".repeat(40))}?${query}`)
  assert.deepEqual([older.status, older.headers.location, older.headers["cache-control"]], [302, path, "no-store"])
  const otherRender = renderId("<!doctype html>", { width: 601 })
  const rebuilt = await raw(drawing.port, `${file.replace(RENDER, otherRender)}?${query}`)
  assert.deepEqual([rebuilt.status, rebuilt.headers.location], [302, path])
  const rebuiltPrevious = await raw(drawing.port, `${file.replace(CURRENT, OLDER).replace(RENDER, otherRender)}?${query}`)
  assert.deepEqual([rebuiltPrevious.status, rebuiltPrevious.headers.location], [302, `${file.replace(CURRENT, OLDER)}?${query}`])
  const wrong = await raw(drawing.port, `${file}?deputy=PA720614`)
  assert.deepEqual([wrong.status, wrong.body.toString()], [404, "Image introuvable\n"])
  assert.equal((await raw(drawing.port, file)).status, 404)
  const alone = await startService({ releases: () => ({ kind: "ready", current: CURRENT_RELEASE, previous: null }) })
  const moved = await raw(alone.port, `${file.replace(CURRENT, OLDER)}?${query}`)
  assert.deepEqual([moved.status, moved.headers.location], [302, path])
  const current = await raw(alone.port, path)
  assert.deepEqual([current.status, current.body.toString()], [200, "jpeg of 2 deputy=PA720892"])
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

test("a crawler's page draws its image ahead only on an idle render slot, never waiting in the queue ahead of the images networks ask for", async () => {
  const stuck = await startService({ behaviour: "hang", limits: { ...LIMITS, concurrency: 1 } })
  await raw(stuck.port, "/?deputy=PA720614", "GET", { "user-agent": CRAWLER })
  await raw(stuck.port, "/?deputy=PA720892", "GET", { "user-agent": CRAWLER })
  await settle()
  assert.deepEqual([stuck.renders.map(({ query }) => query), stuck.queue.running(), stuck.queue.waiting()], [["deputy=PA720614"], 1, 0])
})

test("one client, as Traefik names it in X-Real-Ip, waits past its share behind other clients, and gets the generic image when its turn comes too late", async () => {
  const stuck = await startService({ behaviour: "hang", limits: { ...LIMITS, perClient: 1 }, waitMs: 100 })
  const [first, second, third] = await Promise.all(["deputy=PA720614", "deputy=PA720892", "vote=VTANR5L17V1&color=vote"].map(search => imagePathOf(stuck.port, search)))
  const asking = raw(stuck.port, first ?? "", "GET", { "x-real-ip": "203.0.113.7" })
  await settle()
  const late = await raw(stuck.port, second ?? "", "GET", { "x-real-ip": "203.0.113.7" })
  assert.deepEqual([late.status, late.headers["cache-control"], late.body.toString()], [200, "public, max-age=60", "generic image"])
  const other = raw(stuck.port, third ?? "", "GET", { "x-real-ip": "198.51.100.1" })
  await settle()
  assert.deepEqual([stuck.queue.running(), stuck.queue.waiting(), stuck.queue.clients()], [1, 2, 2])
  await asking
  await other
})

test("an image drawn while the disk refuses to keep it is still served, logged as unsaved, and drawn again next time", async () => {
  const full = await startService({ disk: "full" })
  const path = await imagePathOf(full.port, "deputy=PA720614")
  for (const round of [1, 2]) {
    const answer = await raw(full.port, path)
    assert.deepEqual([answer.status, answer.headers["cache-control"], answer.body.toString()], [200, "public, max-age=31536000, immutable", "jpeg of 2 deputy=PA720614"], `round ${round}`)
  }
  assert.deepEqual(
    full.lines.map(({ outcome, reason, ms }) => [outcome, reason, ms]),
    [
      ["unsaved", "ENOSPC: no space left on device, write", RENDER_CLOCK_MS],
      ["unsaved", "ENOSPC: no space left on device, write", RENDER_CLOCK_MS],
    ],
  )
})

test("the health of the renders counts the failures in a row until an image is drawn, and the seconds since the last one", async () => {
  const failing = await startService({ behaviour: "fail" })
  assert.deepEqual(failing.images.health(), { failuresInARow: 0, secondsSinceImage: null })
  for (const search of ["deputy=PA720614", "deputy=PA720892"]) await raw(failing.port, await imagePathOf(failing.port, search))
  assert.deepEqual(failing.images.health(), { failuresInARow: 2, secondsSinceImage: null })
  await raw(drawing.port, await imagePathOf(drawing.port, "vote=VTANR5L17V1&color=vote&deputy=PA720614"))
  assert.deepEqual(drawing.images.health(), { failuresInARow: 0, secondsSinceImage: 0 })
  drawing.advance(2_400)
  assert.deepEqual(drawing.images.health(), { failuresInARow: 0, secondsSinceImage: 2 })
})

test("a view the data cannot draw, or asked before the first data version, gets the generic image with a short cache and no render", async () => {
  const before = drawing.renders.length
  const { image } = viewOf("vote=VTANR5L17V999999&color=vote")
  const unknown = await raw(drawing.port, `/og/${CURRENT}/${RENDER}/${viewHash(image)}.jpg?${image}`)
  assert.deepEqual([unknown.status, unknown.headers["cache-control"], unknown.body.toString()], [200, "public, max-age=60", "generic image"])
  assert.equal(drawing.renders.length, before)
  const starting = await startService({ releases: () => ({ kind: "starting" }) })
  const early = await raw(starting.port, `/og/${CURRENT}/${RENDER}/${"a".repeat(64)}.jpg`)
  assert.deepEqual([early.status, early.body.toString()], [200, "generic image"])
  assert.equal(starting.renders.length, 0)
})

test("a failed render gets the generic image with a short cache, so the network can ask again", async () => {
  const failing = await startService({ behaviour: "fail" })
  const answer = await raw(failing.port, await imagePathOf(failing.port, "vote=VTANR5L17V1&color=vote"), "GET", { "user-agent": CRAWLER })
  assert.deepEqual([answer.status, answer.headers["content-type"], answer.headers["cache-control"], answer.body.toString()], [200, "image/jpeg", "public, max-age=60", "generic image"])
})

test("a crawler is never answered 429: a full queue or a render too slow to wait for gives it the generic image", async () => {
  const stuck = await startService({ behaviour: "hang", limits: { ...LIMITS, capacity: 0 }, waitMs: 100 })
  const first = await imagePathOf(stuck.port, "vote=VTANR5L17V1&color=vote")
  const second = await imagePathOf(stuck.port, "vote=VTANR5L17V242&color=vote")
  const [late, busy] = await Promise.all([raw(stuck.port, first, "GET", { "user-agent": CRAWLER }), raw(stuck.port, second, "GET", { "user-agent": CRAWLER })])
  for (const answer of [late, busy]) assert.deepEqual([answer.status, answer.headers["cache-control"], answer.body.toString()], [200, "public, max-age=60", "generic image"])
  assert.deepEqual([stuck.renders.length, stuck.queue.running()], [1, 1])
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

test("the data pointer is served as read, cached a minute, open to every origin, and answers 503 until a version is loaded", async () => {
  const pointer = await raw(drawing.port, "/data/v2/current.json")
  assert.deepEqual(
    [pointer.status, pointer.headers["content-type"], pointer.headers["cache-control"], pointer.headers["access-control-allow-origin"], pointer.body.toString()],
    [200, "application/json", "public, max-age=60", "*", POINTER],
  )
  const starting = await startService({ releases: () => ({ kind: "starting" }), pointer: null })
  const early = await raw(starting.port, "/data/v2/current.json")
  assert.deepEqual(
    [early.status, early.headers["retry-after"], early.headers["cache-control"], early.headers["access-control-allow-origin"], early.body.toString()],
    [503, "30", "no-store", "*", "Données indisponibles, réessayez plus tard\n"],
  )
})

test("a version's data files are cached for good, open to every origin, the CSV and JSON compressed when the client accepts it, the photos as they are", async () => {
  const br = await raw(drawing.port, `/data/v2/${CURRENT}/votes/votes.csv`, "GET", { "accept-encoding": "gzip, br" })
  assert.deepEqual(
    [br.status, br.headers["content-type"], br.headers["cache-control"], br.headers["access-control-allow-origin"], br.headers["content-encoding"], br.headers.vary, br.headers["x-content-type-options"]],
    [200, "text/csv; charset=utf-8", "public, max-age=31536000, immutable", "*", "br", "Accept-Encoding", "nosniff"],
  )
  assert.equal(brotliDecompressSync(br.body).toString(), VOTES)
  const gzip = await raw(drawing.port, `/data/v2/${CURRENT}/votes/votes.csv`, "GET", { "accept-encoding": "gzip" })
  assert.deepEqual([gzip.headers["content-encoding"], gunzipSync(gzip.body).toString()], ["gzip", VOTES])
  const plain = await raw(drawing.port, `/data/v2/${CURRENT}/votes/votes.csv?v=1`)
  assert.deepEqual([plain.headers["content-encoding"], plain.headers.vary, plain.body.toString()], [undefined, "Accept-Encoding", VOTES])
  const photo = await raw(drawing.port, `/data/v2/${CURRENT}/photos/PA720892.webp`, "GET", { "accept-encoding": "br" })
  assert.deepEqual(
    [photo.headers["content-type"], photo.headers["cache-control"], photo.headers["access-control-allow-origin"], photo.headers["content-encoding"], photo.headers.vary, photo.body.toString()],
    ["image/webp", "public, max-age=31536000, immutable", "*", undefined, undefined, "WEBP"],
  )
  const head = await raw(drawing.port, `/data/v2/${CURRENT}/votes/votes.csv`, "HEAD")
  assert.deepEqual([head.status, head.headers["content-length"], head.body.length], [200, String(VOTES.length), 0])
})

test("every answer under /data/v2/ is open to every origin but, opened as a page, runs no script, loads nothing, gets an origin of its own and keeps its declared type", async () => {
  const starting = await startService({ releases: () => ({ kind: "starting" }), pointer: null })
  const answers = [
    await raw(drawing.port, `/data/v2/${CURRENT}/seats/hemicycle.svg`),
    await raw(drawing.port, `/data/v2/${CURRENT}/votes/votes.csv`, "GET", { "accept-encoding": "br" }),
    await raw(drawing.port, `/data/v2/${CURRENT}/photos/PA720892.webp`),
    await raw(drawing.port, "/data/v2/current.json"),
    await raw(drawing.port, `/data/v2/${CURRENT}/missing.svg`),
    await raw(starting.port, "/data/v2/current.json"),
  ]
  assert.deepEqual(
    answers.map(({ status, headers }) => [status, headers["access-control-allow-origin"], headers["content-security-policy"], headers["x-content-type-options"]]),
    [200, 200, 200, 200, 404, 503].map(status => [status, "*", "default-src 'none'; style-src 'unsafe-inline'; sandbox", "nosniff"]),
  )
  assert.deepEqual([answers[0]?.headers["content-type"], answers[0]?.body.toString()], ["image/svg+xml", SVG])
})

test("a file of a type the data does not use is never served, even when the version holds it", async () => {
  for (const name of ["index.html", "seats/draw.js", "notes.txt", "README"]) {
    const answer = await raw(drawing.port, `/data/v2/${CURRENT}/${name}`)
    assert.deepEqual([answer.status, answer.headers["content-type"], answer.body.toString()], [404, "text/plain; charset=utf-8", "Fichier introuvable\n"], name)
  }
})

test("no path under /data/v2/ leaves the version's folder: climbs, encoded climbs, hidden files, the store, the runs, links and other names answer 404", async () => {
  for (const path of ["/data/v2/../../secret.txt", "/data/v2/%2e%2e/%2e%2e/secret.txt", `/data/v2/${CURRENT}/../../../secret.txt`, `/data/v2/${CURRENT}/%2e%2e/%2e%2e/%2e%2e/secret.txt`, `/data/v2/${CURRENT}/..\\..\\..\\secret.txt`]) {
    const answer = await raw(drawing.port, path)
    assert.deepEqual([answer.status, answer.body.toString()], [404, "Page introuvable\n"], path)
  }
  for (const path of [
    `/data/v2/${CURRENT}/..%2f..%2f..%2fsecret.txt`,
    `/data/v2/${CURRENT}/votes%2fvotes.csv`,
    `/data/v2/${CURRENT}/.hidden.csv`,
    `/data/v2/${CURRENT}/secret.csv`,
    `/data/v2/${CURRENT}/outside/secret.txt`,
    `/data/v2/.store/${"0".repeat(64)}`,
    "/data/v2/.runs/last.json",
    `/data/v2/${CURRENT}/`,
    `/data/v2/${CURRENT}/votes`,
    `/data/v2/${CURRENT}//votes/votes.csv`,
    `/data/v2/${OLDER}/votes/votes.csv`,
    "/data/v2/main/votes/votes.csv",
    "/data/v2/",
    `/data/v2/${CURRENT}/votes/votes.csv%00`,
  ]) {
    const answer = await raw(drawing.port, path)
    assert.deepEqual([answer.status, answer.headers["access-control-allow-origin"], answer.body.toString()], [404, "*", "Fichier introuvable\n"], path)
  }
  for (const path of ["/data/v1/catalog.json", "/data/secret.txt", "/data"]) assert.deepEqual([(await raw(drawing.port, path)).status], [404], path)
})

test("a data file sent plain goes out from the disk as it is read, byte for byte, its file closed once sent or abandoned", { timeout: 20_000 }, async () => {
  const large = await raw(drawing.port, `/data/v2/${CURRENT}/votes/large.csv`)
  assert.deepEqual([large.status, large.headers["content-length"], large.headers["content-encoding"]], [200, String(LARGE.length), undefined])
  assert.ok(large.body.equals(LARGE))
  const huge = await firstChunk(drawing.port, `/data/v2/${CURRENT}/votes/huge.csv`)
  assert.deepEqual([huge.status, huge.headers["content-length"], huge.chunk.length > 0, huge.chunk.every(byte => byte === 0)], [200, String(HUGE_BYTES), true, true])
  await eventually(async () => (await openDescriptorsOn(join(SNAPSHOT, "votes", "large.csv"))) + (await openDescriptorsOn(join(SNAPSHOT, "votes", "huge.csv"))) === 0, "both files closed")
})

test("a download its client stops reading queues at most 32 KB of its file on the connection, read 16 KB at a time", { timeout: 20_000 }, async () => {
  const running = await startService()
  const slow = await held(running.port, HUGE, {})
  try {
    const [socket] = running.sockets
    assert.ok(socket !== undefined)
    await eventually(() => socket.writableLength > 0, "the kernel's buffers are full")
    let queued = 0
    for (let poll = 0; poll < 20; poll += 1) {
      queued = Math.max(queued, socket.writableLength)
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.ok(queued <= 32 * 1024, `${queued} bytes queued`)
  } finally {
    slow.close()
  }
})

test("past its connection limit, the service closes a new connection at once, and takes new ones again once one closes", { timeout: 20_000 }, async () => {
  const bounded = await startService({ maxConnections: 2 })
  const kept = [connect(bounded.port, "127.0.0.1"), connect(bounded.port, "127.0.0.1")]
  try {
    await Promise.all(kept.map(socket => once(socket, "connect")))
    await eventually(() => bounded.sockets.length === 2, "both connections accepted")
    const third = connect(bounded.port, "127.0.0.1")
    const closed = new Promise(resolve => third.once("close", resolve))
    third.on("error", () => undefined)
    third.write(`GET /healthz HTTP/1.1\r\nHost: server\r\n\r\n`)
    let answered = ""
    third.on("data", (chunk: Buffer) => (answered += chunk.toString()))
    await closed
    assert.deepEqual([answered, bounded.sockets.length], ["", 2])
    kept[0]?.destroy()
    await eventually(() => bounded.sockets.some(socket => socket.destroyed), "the service saw it close")
    assert.equal((await raw(bounded.port, "/healthz")).status, 200)
  } finally {
    for (const socket of kept) socket.destroy()
  }
})

const SCHOOL = { "x-real-ip": "203.0.113.7" }
const HUGE = `/data/v2/${CURRENT}/votes/huge.csv`
const VOTES_PATH = `/data/v2/${CURRENT}/votes/votes.csv`

test("past its limit, a client's data downloads wait for one of its own to end, and get 503 with Retry-After once kept waiting too long; other clients are served meanwhile", { timeout: 20_000 }, async () => {
  const limited = await startService({ downloads: { ...DOWNLOADS, perClient: 2, waiting: 1, waitMs: 100 } })
  const slow = [await held(limited.port, HUGE, SCHOOL), await held(limited.port, HUGE, SCHOOL)]
  try {
    const since = performance.now()
    const refused = await raw(limited.port, VOTES_PATH, "GET", SCHOOL)
    assert.ok(performance.now() - since >= 90, "it waited first")
    assert.deepEqual(
      [refused.status, refused.headers["retry-after"], refused.headers.connection, refused.headers["cache-control"], refused.headers["access-control-allow-origin"], refused.headers["content-security-policy"], refused.body.toString()],
      [503, "30", "close", "no-store", "*", "default-src 'none'; style-src 'unsafe-inline'; sandbox", "Trop de téléchargements en cours, réessayez plus tard\n"],
    )
    assert.equal((await raw(limited.port, VOTES_PATH, "GET", { "x-real-ip": "198.51.100.1" })).status, 200)
    assert.equal((await raw(limited.port, "/data/v2/current.json", "GET", SCHOOL)).status, 200)
    const next = raw(limited.port, VOTES_PATH, "GET", SCHOOL)
    await eventually(() => limited.downloads.counts().waiting === 1, "the school's next download waits")
    slow[0]?.close()
    assert.equal((await next).status, 200)
  } finally {
    for (const one of slow) one.close()
  }
  await eventually(() => limited.downloads.counts().clients === 0, "every place given back")
})

test("a data file answered in full, plain from the disk or compressed from memory, gives its place back to its client", { timeout: 20_000 }, async () => {
  const one = await startService({ downloads: { ...DOWNLOADS, perClient: 1, waiting: 0, waitMs: 60_000 } })
  const statuses = []
  for (const encoding of ["identity", "br", "identity", "br"]) statuses.push((await raw(one.port, VOTES_PATH, "GET", { ...SCHOOL, "accept-encoding": encoding })).status)
  assert.deepEqual(statuses, [200, 200, 200, 200])
  assert.deepEqual(one.downloads.counts(), { clients: 0, running: 0, waiting: 0, waited: 0, refused: 0 })
})

test("a download queued behind another on a pipelined connection gives back its place and its file when the connection closes", { timeout: 20_000 }, async () => {
  const piped = await startService()
  const socket = connect(piped.port, "127.0.0.1")
  await once(socket, "connect")
  const ask = `GET ${HUGE} HTTP/1.1\r\nHost: server\r\nX-Real-Ip: 203.0.113.7\r\n\r\n`
  socket.write(ask + ask)
  await once(socket, "data")
  socket.pause()
  await eventually(() => piped.downloads.counts().running === 2, "both downloads started")
  socket.destroy()
  await eventually(async () => piped.downloads.counts().clients === 0 && (await openDescriptorsOn(join(SNAPSHOT, "votes", "huge.csv"))) === 0, "places and files given back")
})

test("a connection Traefik keeps alive across many requests keeps nothing of the past ones", { timeout: 20_000 }, async () => {
  const kept = await startService()
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })
  after(() => agent.destroy())
  const ask = () =>
    new Promise<number>((resolve, reject) => {
      request({ host: "127.0.0.1", port: kept.port, path: VOTES_PATH, agent, headers: SCHOOL }, response => {
        response.resume()
        response.on("end", () => resolve(response.statusCode ?? 0))
      }).on("error", reject).end()
    })
  const statuses = [await ask()]
  const [socket] = kept.sockets
  assert.ok(socket !== undefined)
  await new Promise(resolve => setTimeout(resolve, 20))
  const listening = socket.listenerCount("close")
  for (let index = 0; index < 20; index += 1) statuses.push(await ask())
  assert.deepEqual([kept.sockets.length, new Set(statuses)], [1, new Set([200])])
  await eventually(() => socket.listenerCount("close") === listening, "as many listeners as after the first request")
})
