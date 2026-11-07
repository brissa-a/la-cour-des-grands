import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { chromium } from "playwright-core"
import { loadShareData } from "../../web/src/share/data.ts"
import { renderId } from "../src/canonical.ts"
import { CAPTURE_SETTINGS } from "../src/capture.ts"
import { createDataFiles, type DataFiles } from "../src/dataFiles.ts"
import { openDiskCache } from "../src/disk.ts"
import { given, ORIGIN } from "../src/fixture.test.ts"
import { createImages, type RenderLine } from "../src/images.ts"
import { renderQueue } from "../src/queue.ts"
import type { Releases } from "../src/releases.ts"
import { createRenderer, type Renderer } from "../src/renderer.ts"
import { createService } from "../src/server.ts"
import { loadSite } from "../src/site.ts"
import { snapshotReader } from "../src/snapshot.ts"
import { parseTemplate } from "../src/tags.ts"
import { DATA_ROOT, POINTER, VERSION } from "./dataRoot.ts"
import { jpegSize } from "./jpeg.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-service-"))
const site = await loadSite(new URL("../../web/dist/", import.meta.url).pathname)
const render = renderId(site.index, CAPTURE_SETTINGS)
const releases: Releases = { kind: "ready", current: { version: VERSION, data: await loadShareData(snapshotReader(DATA_ROOT, VERSION)) }, previous: null }
const GENERIC = Buffer.from("generic image")
const FILES = createDataFiles(DATA_ROOT, 64 * 1024 ** 2)

type Running = { readonly local: string; readonly lines: RenderLine[]; readonly close: () => Promise<void> }

async function startService(captured: DataFiles = FILES): Promise<Running> {
  const renderer: Renderer = createRenderer(site, captured, { kind: "launch" })
  const lines: RenderLine[] = []
  const images = createImages({
    releases: () => releases,
    cache: await openDiskCache(await mkdtemp(join(scratch, "cache-")), 100 * 1024 ** 2, render, () => VERSION),
    queue: renderQueue<Buffer>({ concurrency: 2, capacity: 12, perClient: 4, timeoutMs: 12_000 }),
    render: renderer.render,
    renderId: render,
    waitMs: 20_000,
    log: line => lines.push(line),
    now: () => performance.now(),
  })
  const server = createService({
    site,
    page: { template: parseTemplate(site.index), origin: ORIGIN, render },
    releases: () => releases,
    pointer: () => POINTER,
    data: FILES,
    images,
    fallback: () => GENERIC,
    health: () => ({ status: "ok" }),
    logError: error => {
      throw error
    },
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address !== null && typeof address === "object")
  return {
    local: `http://127.0.0.1:${address.port}`,
    lines,
    close: async () => {
      server.close()
      await renderer.close()
    },
  }
}

after(() => rm(scratch, { recursive: true, force: true }))

type Fetched = { readonly body: Buffer; readonly ms: number; readonly cacheControl: string | null }

async function imageOf(local: string, search: string): Promise<Fetched> {
  const page = await fetch(`${local}/${search}`, { headers: { "user-agent": "Mozilla/5.0" } })
  assert.equal(page.status, 200, search)
  const image = given(/<meta property="og:image" content="([^"]+)" \/>/.exec(await page.text())?.[1], `og:image of ${search}`).replaceAll("&amp;", "&")
  assert.ok(image.startsWith(`${ORIGIN}/og/${VERSION}/${render}/`), image)
  const started = performance.now()
  const response = await fetch(local + image.slice(ORIGIN.length))
  assert.equal(response.status, 200, image)
  assert.equal(response.headers.get("content-type"), "image/jpeg")
  return { body: Buffer.from(await response.arrayBuffer()), ms: Math.round(performance.now() - started), cacheControl: response.headers.get("cache-control") }
}

test("the real service draws a page's preview with Chromium from the local build and the pinned data, 1200x630 JPEG, then serves it from its cache", { timeout: 90_000 }, async t => {
  const running = await startService()
  t.after(running.close)
  const cold = await imageOf(running.local, "?vote=VTANR5L17V1&color=vote&deputy=PA720892")
  assert.deepEqual(jpegSize(cold.body), { width: 1200, height: 630 })
  assert.equal(cold.cacheControl, "public, max-age=31536000, immutable")
  const warm = await imageOf(running.local, "?color=deputies%2Finit.csv%3Aregion")
  assert.deepEqual(jpegSize(warm.body), { width: 1200, height: 630 })
  const cached = await imageOf(running.local, "?vote=VTANR5L17V1&color=vote&deputy=PA720892")
  assert.deepEqual(cached.body, cold.body)
  assert.deepEqual(
    running.lines.map(({ outcome, query }) => [outcome, query]),
    [
      ["image", "vote=VTANR5L17V1&color=vote&deputy=PA720892"],
      ["image", "color=deputies%2Finit.csv%3Aregion"],
    ],
  )
  t.diagnostic(`render ms: cold ${cold.ms}, warm ${warm.ms}, from the cache ${cached.ms}; logged ${running.lines.map(({ ms }) => ms).join(", ")}`)
})

test("a capture page that reports an error, as when the data answers 404, is never kept: the network gets the generic image for a minute", { timeout: 60_000 }, async t => {
  const asked: string[] = []
  const missing: DataFiles = {
    get: (version, path) => {
      asked.push(`${version}/${path}`)
      return Promise.resolve(null)
    },
  }
  const running = await startService(missing)
  t.after(running.close)
  const page = await fetch(`${running.local}/?deputy=PA720892`)
  const image = given(/<meta property="og:image" content="([^"]+)" \/>/.exec(await page.text())?.[1], "og:image").replaceAll("&amp;", "&")
  const response = await fetch(running.local + image.slice(ORIGIN.length))
  assert.deepEqual([response.status, response.headers.get("cache-control"), Buffer.from(await response.arrayBuffer()).toString()], [200, "public, max-age=60", "generic image"])
  assert.deepEqual(
    running.lines.map(({ outcome, reason }) => [outcome, reason]),
    [["failed", 'the capture page reported data-drawing="error"']],
  )
  assert.ok(asked.length > 0 && asked.every(path => path.startsWith(`${VERSION}/`)), asked.join(", "))
})

test("a browser on the site reads the current version from the pointer, then every data file and photo from that version's folder on the same origin", { timeout: 60_000 }, async t => {
  const running = await startService()
  t.after(running.close)
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const page = await browser.newPage()
  const asked: string[] = []
  const photos: [string, number, string | null][] = []
  page.on("request", request => asked.push(request.url().slice(running.local.length)))
  page.on("response", response => {
    if (response.url().endsWith(".webp") && response.status() === 200) photos.push([response.url().slice(running.local.length), response.status(), response.headers()["content-type"] ?? null])
  })
  await page.goto(`${running.local}/?deputy=PA720892&showPic=true`)
  await page.waitForSelector('html[data-drawing="ready"]', { state: "attached", timeout: 30_000 })
  const data = asked.filter(path => path.startsWith("/data/"))
  const root = `/data/v2/${VERSION}/`
  assert.equal(data[0], "/data/v2/current.json")
  assert.ok(data.length > 5 && data.slice(1).every(path => path.startsWith(root)), data.join(", "))
  assert.deepEqual(photos, [[`${root}photos/PA720892.webp`, 200, "image/webp"]])
  assert.equal(await page.locator('.seat image[href$="/PA720892.webp"]').getAttribute("href"), `${root}photos/PA720892.webp`)
})
