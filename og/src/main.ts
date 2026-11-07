import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { canonicalView, renderId } from "./canonical.ts"
import { CAPTURE_SETTINGS } from "./capture.ts"
import { readConfig } from "./config.ts"
import { createDataFiles } from "./dataFiles.ts"
import { openDiskCache, removeTemporaries, writeAtomically } from "./disk.ts"
import { createFallback } from "./fallback.ts"
import { createImages } from "./images.ts"
import { renderQueue } from "./queue.ts"
import { reasonOf } from "./reason.ts"
import { retained, watchReleases, type Releases } from "./releases.ts"
import { createRenderer } from "./renderer.ts"
import { createService } from "./server.ts"
import { loadSite } from "./site.ts"
import { dataRootSource } from "./snapshot.ts"
import { parseTemplate } from "./tags.ts"

const CACHE_MAX_BYTES = 2 * 1024 ** 3
const COMPRESSED_DATA_MAX_BYTES = 32 * 1024 ** 2
// The pipeline replaces the pointer by a rename, which ends a watch on the file; reading a local file every 30 s costs nothing.
const POINTER_POLL_MS = 30_000
const REQUEST_WAIT_MS = 8_000
const QUEUE = { concurrency: 2, capacity: 12, perClient: 2, timeoutMs: 12_000 } as const
const FALLBACK_RETRY_MS = 60_000

function log(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

const config = readConfig(process.env, join(import.meta.dirname, ".."))
const site = await loadSite(config.dist)
const render = renderId(site.index, CAPTURE_SETTINGS)
const fallbackFile = join(config.cacheDir, "fallback.jpg")
await removeTemporaries(config.cacheDir).catch(() => undefined)

let state: () => Releases = () => ({ kind: "starting" })
const currentVersion = () => {
  const now = state()
  return now.kind === "ready" ? now.current.version : null
}

const cache = await openDiskCache(join(config.cacheDir, "images"), CACHE_MAX_BYTES, render, currentVersion)
const data = createDataFiles(config.dataRoot, COMPRESSED_DATA_MAX_BYTES)
const renderer = createRenderer(site, data, config.browser)
const queue = renderQueue<Buffer>(QUEUE)
const images = createImages({ releases: () => state(), cache, queue, render: renderer.render, renderId: render, waitMs: REQUEST_WAIT_MS, log: line => log("render", line), now: () => performance.now() })
const fallback = createFallback({
  draw: release => images.image(release, canonicalView(new URLSearchParams(), release.data)),
  save: jpeg => writeAtomically(fallbackFile, jpeg),
  saved: await readFile(fallbackFile).catch(() => null),
  retryMs: FALLBACK_RETRY_MS,
  log,
})

const watch = watchReleases({
  ...dataRootSource(config.dataRoot),
  onRelease: async ready => {
    const version = ready.current.version
    await cache.keep(retained(ready).map(release => release.version)).catch((error: unknown) => log("cache-keep-failed", { version, reason: reasonOf(error) }))
    fallback.follow(ready.current)
  },
  log,
  everyMs: POINTER_POLL_MS,
})
state = watch.state

const server = createService({
  site,
  page: { template: parseTemplate(site.index), origin: config.origin, render },
  releases: watch.state,
  pointer: watch.pointer,
  data,
  images,
  fallback: fallback.image,
  health: () => ({ status: "ok", data: watch.state().kind, version: currentVersion(), pointed: watch.pointed(), render, renders: { running: queue.running(), waiting: queue.waiting(), clients: queue.clients(), ...images.health() }, cacheBytes: cache.bytes() }),
  logError: error => log("error", { reason: error instanceof Error ? (error.stack ?? error.message) : reasonOf(error) }),
})

server.listen(config.port, () => log("listening", { port: config.port, origin: config.origin, render, browser: config.browser.kind, dataRoot: config.dataRoot }))

process.once("SIGTERM", () => {
  watch.stop()
  fallback.stop()
  server.close()
  void renderer.close().finally(() => process.exit(0))
})
