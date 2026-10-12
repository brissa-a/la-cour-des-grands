import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { dataRootAt, fetchUnder } from "../../web/src/data/source.ts"
import { loadShareData } from "../../web/src/share/data.ts"
import { renderId } from "../src/canonical.ts"
import { CAPTURE_SETTINGS } from "../src/capture.ts"
import { openDiskCache } from "../src/disk.ts"
import { given, ORIGIN, SHA } from "../src/fixture.test.ts"
import { createImages, type RenderLine } from "../src/images.ts"
import { renderQueue } from "../src/queue.ts"
import type { Releases } from "../src/releases.ts"
import { createRenderer, type Renderer } from "../src/renderer.ts"
import { createService } from "../src/server.ts"
import { loadSite } from "../src/site.ts"
import { parseTemplate } from "../src/tags.ts"
import { createUpstream, type Upstream } from "../src/upstream.ts"
import { jpegSize } from "./jpeg.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-service-"))
const site = await loadSite(new URL("../../web/dist/", import.meta.url).pathname)
const render = renderId(site.index, CAPTURE_SETTINGS)
const releases: Releases = { kind: "ready", current: { version: SHA, data: await loadShareData(fetchUnder(dataRootAt(SHA))) }, previous: null }
const GENERIC = Buffer.from("generic image")

type Running = { readonly local: string; readonly lines: RenderLine[]; readonly close: () => Promise<void> }

async function startService(upstream: Upstream): Promise<Running> {
  const renderer: Renderer = createRenderer(site, upstream, { kind: "launch" })
  const lines: RenderLine[] = []
  const images = createImages({
    releases: () => releases,
    cache: await openDiskCache(await mkdtemp(join(scratch, "cache-")), 100 * 1024 ** 2, render, () => SHA),
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
  assert.ok(image.startsWith(`${ORIGIN}/og/${SHA}/${render}/`), image)
  const started = performance.now()
  const response = await fetch(local + image.slice(ORIGIN.length))
  assert.equal(response.status, 200, image)
  assert.equal(response.headers.get("content-type"), "image/jpeg")
  return { body: Buffer.from(await response.arrayBuffer()), ms: Math.round(performance.now() - started), cacheControl: response.headers.get("cache-control") }
}

test("the real service draws a page's preview with Chromium from the local build and the pinned data, 1200x630 JPEG, then serves it from its cache", { timeout: 90_000 }, async t => {
  const running = await startService(createUpstream(fetch, { maxBytes: 64 * 1024 ** 2, parallel: 16, timeoutMs: 5_000 }))
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
  const missing: Upstream = {
    get: url => {
      asked.push(url)
      return Promise.resolve({ status: 404, contentType: "text/plain; charset=utf-8", body: Buffer.from("404: Not Found") })
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
  assert.ok(asked.length > 0 && asked.every(url => url.startsWith(dataRootAt(SHA))), asked.join(", "))
})
