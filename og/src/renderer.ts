import { chromium, type Browser, type Route } from "playwright-core"
import { recycler } from "./browsers.ts"
import type { CanonicalQuery } from "./canonical.ts"
import { captureRoute, captureUrl } from "./capture.ts"
import { siteFile, type StaticSite } from "./site.ts"
import { IMAGE_HEIGHT, IMAGE_WIDTH } from "./tags.ts"
import type { Upstream } from "./upstream.ts"
import type { DataVersion } from "./version.ts"

export type CaptureTarget = { readonly version: DataVersion; readonly query: CanonicalQuery }

export type Render = (target: CaptureTarget, signal: AbortSignal) => Promise<Buffer>

export type Renderer = { readonly render: Render; readonly close: () => Promise<void> }

// The capture view is laid out for 600x315 shot at scale 2: its labels then read at 10 to 12 px once a network shrinks the image.
const SCALE = 2
const VIEWPORT = { width: IMAGE_WIDTH / SCALE, height: IMAGE_HEIGHT / SCALE }
const NAVIGATION_TIMEOUT_MS = 10_000
const DRAWING_TIMEOUT_MS = 12_000
const JPEG_QUALITY = 80
const RENDERS_PER_BROWSER = 100

export function createRenderer(site: StaticSite, upstream: Upstream): Renderer {
  const browsers = recycler<Browser>({
    launch: async lost => {
      const browser = await chromium.launch({ headless: true })
      browser.on("disconnected", lost)
      return browser
    },
    close: browser => browser.close(),
    maxUses: RENDERS_PER_BROWSER,
  })
  return {
    render: (target, signal) => browsers.use(browser => capture(browser, target, signal, site, upstream)),
    close: browsers.close,
  }
}

async function capture(browser: Browser, target: CaptureTarget, signal: AbortSignal, site: StaticSite, upstream: Upstream): Promise<Buffer> {
  signal.throwIfAborted()
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  })
  const abandon = () => void context.close()
  signal.addEventListener("abort", abandon, { once: true })
  try {
    await context.route("**/*", route => answer(route, target.version, site, upstream).catch(() => undefined))
    const page = await context.newPage()
    await page.goto(captureUrl(target.query), { waitUntil: "commit", timeout: NAVIGATION_TIMEOUT_MS })
    const settled = await page.waitForFunction(
      () => {
        const drawing = document.documentElement.dataset.drawing
        return drawing === "ready" || drawing === "error" ? drawing : null
      },
      undefined,
      { timeout: DRAWING_TIMEOUT_MS },
    )
    const drawing = await settled.jsonValue()
    if (drawing !== "ready") throw new Error(`the capture page reported data-drawing="${drawing ?? "none"}"`)
    return await page.screenshot({ type: "jpeg", quality: JPEG_QUALITY, timeout: NAVIGATION_TIMEOUT_MS })
  } finally {
    signal.removeEventListener("abort", abandon)
    await context.close()
  }
}

async function answer(route: Route, version: DataVersion, site: StaticSite, upstream: Upstream): Promise<void> {
  const target = captureRoute(route.request().url(), version)
  switch (target.kind) {
    case "site": {
      const file = siteFile(site, target.path)
      return file === null ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, headers: { "content-type": file.type }, body: file.body })
    }
    case "upstream": {
      const response = await upstream.get(target.url).catch(() => null)
      if (response === null) return route.abort("failed")
      return route.fulfill({ status: response.status, headers: { "content-type": response.contentType, "access-control-allow-origin": "*" }, body: response.body })
    }
    case "blocked":
      return route.abort("blockedbyclient")
  }
}
