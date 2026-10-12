import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { dataRootAt, fetchUnder } from "../../web/src/data/source.ts"
import { loadShareData } from "../../web/src/share/data.ts"
import { openDiskCache } from "../src/disk.ts"
import { given, ORIGIN, SHA } from "../src/fixture.test.ts"
import { createImages, type RenderLine } from "../src/images.ts"
import { renderQueue } from "../src/queue.ts"
import type { Releases } from "../src/releases.ts"
import { createRenderer } from "../src/renderer.ts"
import { createService } from "../src/server.ts"
import { loadSite } from "../src/site.ts"
import { parseTemplate } from "../src/tags.ts"
import { createUpstream } from "../src/upstream.ts"
import { jpegSize } from "./jpeg.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-service-"))
const site = await loadSite(new URL("../../web/dist/", import.meta.url).pathname)
const releases: Releases = { kind: "ready", current: { version: SHA, data: await loadShareData(fetchUnder(dataRootAt(SHA))) }, previous: null }
const renderer = createRenderer(site, createUpstream(fetch, { maxBytes: 64 * 1024 ** 2, parallel: 16, timeoutMs: 5_000 }))
const lines: RenderLine[] = []
const images = createImages({
  releases: () => releases,
  cache: await openDiskCache(scratch, 100 * 1024 ** 2, () => SHA),
  queue: renderQueue<Buffer>({ concurrency: 2, capacity: 12, timeoutMs: 12_000 }),
  render: renderer.render,
  waitMs: 20_000,
  log: line => lines.push(line),
  now: () => performance.now(),
})
const server = createService({
  site,
  template: parseTemplate(site.index),
  origin: ORIGIN,
  releases: () => releases,
  images,
  fallback: () => null,
  health: () => ({ status: "ok" }),
  logError: error => {
    throw error
  },
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const address = server.address()
assert.ok(address !== null && typeof address === "object")
const local = `http://127.0.0.1:${address.port}`

after(async () => {
  server.close()
  await renderer.close()
  await rm(scratch, { recursive: true, force: true })
})

async function imageOf(search: string): Promise<{ readonly jpeg: Buffer; readonly ms: number; readonly cacheControl: string | null }> {
  const page = await fetch(`${local}/${search}`, { headers: { "user-agent": "Mozilla/5.0" } })
  assert.equal(page.status, 200, search)
  const image = given(/<meta property="og:image" content="([^"]+)" \/>/.exec(await page.text())?.[1], `og:image of ${search}`).replaceAll("&amp;", "&")
  assert.ok(image.startsWith(`${ORIGIN}/og/${SHA}/`), image)
  const started = performance.now()
  const response = await fetch(local + image.slice(ORIGIN.length))
  assert.equal(response.status, 200, image)
  assert.equal(response.headers.get("content-type"), "image/jpeg")
  return { jpeg: Buffer.from(await response.arrayBuffer()), ms: Math.round(performance.now() - started), cacheControl: response.headers.get("cache-control") }
}

test("the real service draws a page's preview with Chromium from the local build and the pinned data, 1200x630 JPEG, then serves it from its cache", { timeout: 90_000 }, async t => {
  const cold = await imageOf("?vote=VTANR5L17V1&color=vote&deputy=PA720892")
  assert.deepEqual(jpegSize(cold.jpeg), { width: 1200, height: 630 })
  assert.equal(cold.cacheControl, "public, max-age=31536000, immutable")
  const warm = await imageOf("?color=deputies%2Finit.csv%3Aage")
  assert.deepEqual(jpegSize(warm.jpeg), { width: 1200, height: 630 })
  const photos = await imageOf("?vote=VTANR5L17V242&color=vote&showPic=true")
  const cached = await imageOf("?vote=VTANR5L17V1&color=vote&deputy=PA720892")
  assert.deepEqual(cached.jpeg, cold.jpeg)
  assert.deepEqual(
    lines.map(({ outcome, query }) => [outcome, query]),
    [
      ["image", "vote=VTANR5L17V1&color=vote&deputy=PA720892"],
      ["image", "color=deputies%2Finit.csv%3Aage"],
      ["image", "vote=VTANR5L17V242&color=vote&showPic=true"],
    ],
  )
  t.diagnostic(`render ms: cold ${cold.ms}, warm ${warm.ms}, photos ${photos.ms}, from the cache ${cached.ms}; logged ${lines.map(({ ms }) => ms).join(", ")}`)
  t.diagnostic(`JPEG bytes: ${cold.jpeg.length}, ${warm.jpeg.length}, ${photos.jpeg.length}`)
})
