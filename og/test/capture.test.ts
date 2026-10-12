import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { test } from "node:test"
import { dataRootAt, fetchUnder } from "../../web/src/data/source.ts"
import { loadShareData } from "../../web/src/share/data.ts"
import { canonicalView } from "../src/canonical.ts"
import { CAPTURE_SETTINGS } from "../src/capture.ts"
import type { BrowserSource } from "../src/config.ts"
import { SHA } from "../src/fixture.test.ts"
import { createRenderer, openBrowser, withCapturePage } from "../src/renderer.ts"
import { loadSite } from "../src/site.ts"
import { createUpstream } from "../src/upstream.ts"
import { jpegSize } from "./jpeg.ts"

const site = await loadSite(new URL("../../web/dist/", import.meta.url).pathname)
const data = await loadShareData(fetchUnder(dataRootAt(SHA)))
const upstream = createUpstream(fetch, { maxBytes: 64 * 1024 ** 2, parallel: 16, timeoutMs: 5_000 })
const LOCAL: BrowserSource = { kind: "launch" }

const VIEWS = [
  "",
  "color=deputies%2Finit.csv%3Aregion",
  "color=deputies%2Finit.csv%3Aregion&chart=deputies%2Finit.csv%3Agroup",
  "color=deputies%2Finit.csv%3Acivility",
  "color=deputies%2Finit.csv%3Aage",
  "vote=VTANR5L17V8427&color=vote&deputy=PA720892",
  "vote=VTANR5L17V8427&chart=vote&color=deputies%2Finit.csv%3Aregion",
] as const

type Box = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

type Layout = { readonly legend: Box | null; readonly room: Box; readonly clipped: readonly string[] }

const apart = (a: Box, b: Box) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top

// X crops the image to 2:1 around its middle.
const CROPPED = (CAPTURE_SETTINGS.height - CAPTURE_SETTINGS.width / 2) / 2

test("every capture keeps its legend inside the part of the image X shows, beside or under the room without covering it, and no label cut", { timeout: 120_000 }, async t => {
  const browser = await openBrowser(LOCAL)
  t.after(() => browser.close())
  for (const search of VIEWS) {
    const { image } = canonicalView(new URLSearchParams(search), data)
    const layout = await withCapturePage(browser, { version: SHA, query: image }, site, upstream, AbortSignal.timeout(30_000), page =>
      page.evaluate((): Layout => {
        const boxOf = (element: Element): Box => {
          const { left, top, right, bottom } = element.getBoundingClientRect()
          return { left, top, right, bottom }
        }
        const required = (selector: string) => {
          const element = document.querySelector(selector)
          if (element === null) throw new Error(`no ${selector}`)
          return element
        }
        const legend = document.querySelector(".legend")
        const clipped = [...document.querySelectorAll(".legend li, .legend-name")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent)
        return { legend: legend && boxOf(legend), room: boxOf(required(".stage svg")), clipped }
      }),
    )
    assert.deepEqual(layout.clipped, [], search)
    if (layout.legend === null) continue
    const { legend, room } = layout
    assert.ok(legend.left >= 0 && legend.top >= CROPPED && legend.right <= CAPTURE_SETTINGS.width && legend.bottom <= CAPTURE_SETTINGS.height - CROPPED, `${search}: legend ${JSON.stringify(legend)} out of the frame`)
    assert.ok(apart(legend, room), `${search}: legend ${JSON.stringify(legend)} over the room ${JSON.stringify(room)}`)
  }
})

test("a Chromium in another container, reached through a Playwright server, draws the same image and reaches nothing the service does not answer", { timeout: 90_000 }, async () => {
  const server = spawn(process.execPath, [new URL("../node_modules/playwright-core/cli.js", import.meta.url).pathname, "run-server", "--port", "0", "--host", "127.0.0.1", "--path", "/capture"])
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      server.stdout.once("data", (chunk: Buffer) => resolve(/ws:\/\/\S+/.exec(chunk.toString())?.[0] ?? ""))
      server.once("error", reject)
    })
    const remote: BrowserSource = { kind: "connect", endpoint }
    const renderer = createRenderer(site, upstream, remote)
    try {
      const jpeg = await renderer.render({ version: SHA, query: canonicalView(new URLSearchParams("deputy=PA720892"), data).image }, AbortSignal.timeout(30_000))
      assert.deepEqual(jpegSize(jpeg), { width: 1200, height: 630 })
    } finally {
      await renderer.close()
    }
    const browser = await openBrowser(remote)
    try {
      const page = await (await browser.newContext()).newPage()
      await assert.rejects(page.goto("https://example.com/"), /ERR_PROXY_CONNECTION_FAILED/)
    } finally {
      await browser.close()
    }
  } finally {
    server.kill("SIGKILL")
  }
})
