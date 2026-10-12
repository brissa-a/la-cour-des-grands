import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { dataRootAt, fetchUnder } from "../../web/src/data/source.ts"
import { loadShareData } from "../../web/src/share/data.ts"
import { canonicalView } from "./canonical.ts"
import { readConfig } from "./config.ts"
import { reasonOf } from "./reason.ts"
import { openDiskCache, writeAtomically } from "./disk.ts"
import { createImages } from "./images.ts"
import { renderQueue } from "./queue.ts"
import { retained, watchReleases, type Ready, type Releases } from "./releases.ts"
import { createRenderer } from "./renderer.ts"
import { createService } from "./server.ts"
import { loadSite } from "./site.ts"
import { parseTemplate } from "./tags.ts"
import { createUpstream } from "./upstream.ts"
import { checkVersion, dataVersion } from "./version.ts"

const CACHE_MAX_BYTES = 2 * 1024 ** 3
const UPSTREAM = { maxBytes: 64 * 1024 ** 2, parallel: 16, timeoutMs: 5_000 } as const
const VERSION_POLL_MS = 5 * 60_000
const REQUEST_WAIT_MS = 8_000
const QUEUE = { concurrency: 2, capacity: 12, timeoutMs: 12_000 } as const

function log(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

const config = readConfig(process.env, join(import.meta.dirname, ".."))
const site = await loadSite(config.dist)
const template = parseTemplate(site.index)
const versionFile = join(config.cacheDir, "version")
const fallbackFile = join(config.cacheDir, "fallback.jpg")

let state: () => Releases = () => ({ kind: "starting" })
const currentVersion = () => {
  const now = state()
  return now.kind === "ready" ? now.current.version : null
}

const cache = await openDiskCache(join(config.cacheDir, "images"), CACHE_MAX_BYTES, currentVersion)
const upstream = createUpstream(fetch, UPSTREAM)
const renderer = createRenderer(site, upstream)
const queue = renderQueue<Buffer>(QUEUE)
const images = createImages({ releases: () => state(), cache, queue, render: renderer.render, waitMs: REQUEST_WAIT_MS, log: line => log("render", line), now: () => performance.now() })

let fallback: Buffer | null = await readFile(fallbackFile).catch(() => null)
let fallbackDrawn = false

async function drawFallback(ready: Ready): Promise<void> {
  const image = await images.image(ready.current, canonicalView(new URLSearchParams(), ready.current.data))
  if (image === null) return
  await writeAtomically(fallbackFile, image)
  fallback = image
}

const watch = watchReleases({
  check: etag => checkVersion(fetch, etag),
  load: version => loadShareData(fetchUnder(dataRootAt(version))),
  saved: dataVersion((await readFile(versionFile, "utf8").catch(() => "")).trim()),
  onRelease: async ready => {
    await writeAtomically(versionFile, ready.current.version)
    await cache.keep(retained(ready).map(release => release.version))
    upstream.clear()
    if (fallbackDrawn) return
    fallbackDrawn = true
    void drawFallback(ready).catch((error: unknown) => log("fallback-failed", { reason: reasonOf(error) }))
  },
  log,
  everyMs: VERSION_POLL_MS,
})
state = watch.state

const server = createService({
  site,
  template,
  origin: config.origin,
  releases: watch.state,
  images,
  fallback: () => fallback,
  health: () => ({ status: "ok", data: watch.state().kind, version: currentVersion(), renders: { running: queue.running(), waiting: queue.waiting() }, cacheBytes: cache.bytes() }),
  logError: error => log("error", { reason: error instanceof Error ? (error.stack ?? error.message) : reasonOf(error) }),
})

server.listen(config.port, () => log("listening", { port: config.port, origin: config.origin }))

process.once("SIGTERM", () => {
  watch.stop()
  server.close()
  void renderer.close().finally(() => process.exit(0))
})
