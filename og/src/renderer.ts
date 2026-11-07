import { chromium, type Browser, type LaunchOptions, type Page, type Route } from "playwright-core"
import type { DataVersion } from "../../web/src/data/version.ts"
import { recycler } from "./browsers.ts"
import type { ImageQuery } from "./canonical.ts"
import { CAPTURE_SETTINGS, capturePointer, captureRoute, captureUrl } from "./capture.ts"
import type { BrowserSource } from "./config.ts"
import type { DataFiles } from "./dataFiles.ts"
import { siteFile, type StaticSite } from "./site.ts"

export type CaptureTarget = { readonly version: DataVersion; readonly query: ImageQuery }

export type Render = (target: CaptureTarget, signal: AbortSignal) => Promise<Buffer>

export type Renderer = { readonly render: Render; readonly close: () => Promise<void> }

const NAVIGATION_TIMEOUT_MS = 10_000
const DRAWING_TIMEOUT_MS = 12_000
const CONNECT_TIMEOUT_MS = 30_000
const RENDERS_PER_BROWSER = 100
const SETTLED = 'html[data-drawing="ready"], html[data-drawing="error"]'

// Every request the page makes is answered by Node through context.route; the proxy only catches what routing does not see.
const LAUNCH: LaunchOptions = { headless: true, proxy: { server: "http://127.0.0.1:9" } }

export function openBrowser(source: BrowserSource): Promise<Browser> {
  switch (source.kind) {
    case "launch":
      return chromium.launch(LAUNCH)
    case "connect":
      return chromium.connect(source.endpoint, { headers: { "x-playwright-launch-options": JSON.stringify(LAUNCH) }, timeout: CONNECT_TIMEOUT_MS })
  }
}

export function createRenderer(site: StaticSite, data: DataFiles, source: BrowserSource): Renderer {
  const browsers = recycler<Browser>({
    launch: async lost => {
      const browser = await openBrowser(source)
      browser.on("disconnected", lost)
      return browser
    },
    close: browser => browser.close(),
    maxUses: RENDERS_PER_BROWSER,
  })
  return {
    render: (target, signal) =>
      browsers.use(browser => withCapturePage(browser, target, site, data, signal, page => page.screenshot({ type: "jpeg", quality: CAPTURE_SETTINGS.jpegQuality, timeout: NAVIGATION_TIMEOUT_MS }))),
    close: browsers.close,
  }
}

export async function withCapturePage<T>(browser: Browser, target: CaptureTarget, site: StaticSite, data: DataFiles, signal: AbortSignal, use: (page: Page) => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  const context = await browser.newContext({
    viewport: { width: CAPTURE_SETTINGS.width, height: CAPTURE_SETTINGS.height },
    deviceScaleFactor: CAPTURE_SETTINGS.scale,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  })
  const abandon = () => void context.close()
  signal.addEventListener("abort", abandon, { once: true })
  try {
    await context.route("**/*", route => answer(route, target.version, site, data).catch(() => undefined))
    await context.routeWebSocket(/./, socket => socket.close())
    const page = await context.newPage()
    await page.goto(captureUrl(target.query), { waitUntil: "commit", timeout: NAVIGATION_TIMEOUT_MS })
    const settled = await page.waitForSelector(SETTLED, { state: "attached", timeout: DRAWING_TIMEOUT_MS })
    const drawing = await settled.getAttribute("data-drawing")
    if (drawing !== "ready") throw new Error(`the capture page reported data-drawing="${drawing ?? "none"}"`)
    return await use(page)
  } finally {
    signal.removeEventListener("abort", abandon)
    await context.close()
  }
}

async function answer(route: Route, version: DataVersion, site: StaticSite, data: DataFiles): Promise<void> {
  const target = captureRoute(route.request().url(), version)
  switch (target.kind) {
    case "site": {
      const file = siteFile(site, target.path)
      return file === null ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, headers: { "content-type": file.type }, body: file.body })
    }
    case "pointer":
      return route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: capturePointer(version) })
    case "data": {
      const file = await data.get(version, target.file, "identity").catch(() => null)
      return file === null ? route.fulfill({ status: 404 }) : route.fulfill({ status: 200, headers: { "content-type": file.type }, body: file.body })
    }
    case "blocked":
      return route.abort("blockedbyclient")
  }
}
