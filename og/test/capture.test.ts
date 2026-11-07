import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { test } from "node:test"
import { dataVersion } from "../../web/src/data/version.ts"
import { loadShareData } from "../../web/src/share/data.ts"
import { canonicalView } from "../src/canonical.ts"
import { CAPTURE_SETTINGS } from "../src/capture.ts"
import type { BrowserSource } from "../src/config.ts"
import { createDataFiles, type ReadDataFile } from "../src/dataFiles.ts"
import { given } from "../src/fixture.test.ts"
import { createRenderer, openBrowser, withCapturePage } from "../src/renderer.ts"
import { loadSite } from "../src/site.ts"
import { snapshotReader } from "../src/snapshot.ts"
import { DATA_ROOT, VERSION } from "./dataRoot.ts"
import { jpegSize } from "./jpeg.ts"

const site = await loadSite(new URL("../../web/dist/", import.meta.url).pathname)
const data = await loadShareData(snapshotReader(DATA_ROOT, VERSION))
const readData = createDataFiles(DATA_ROOT, { keptBytes: 64 * 1024 ** 2, compressions: 2 }).read
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

type Painted = { readonly under: number; readonly over: number }

type Layout = {
  readonly legend: Box | null
  readonly lines: number
  readonly seats: Box
  readonly tribune: Box | null
  readonly floor: (Box & Painted) | null
  readonly ramp: { readonly mean: Box; readonly bar: Box } | null
  readonly clipped: readonly string[]
}

// X crops the image to 2:1 around its middle.
const CROPPED = (CAPTURE_SETTINGS.height - CAPTURE_SETTINGS.width / 2) / 2

test("every capture keeps its legend inside the part of the image X shows, clear of every seat and of the tribune with only the room's floor under it, on two lines at most, a ramp on one with its mean first, and no label cut", { timeout: 120_000 }, async t => {
  const browser = await openBrowser(LOCAL)
  t.after(() => browser.close())
  for (const search of VIEWS) {
    const { image } = canonicalView(new URLSearchParams(search), data)
    const layout = await withCapturePage(browser, { version: VERSION, query: image }, site, readData, AbortSignal.timeout(30_000), page =>
      page.evaluate((): Layout => {
        const boxOf = (element: Element): Box => {
          const { left, top, right, bottom } = element.getBoundingClientRect()
          return { left, top, right, bottom }
        }
        const boxOfAll = (selector: string): Box =>
          [...document.querySelectorAll(selector)].map(boxOf).reduce((all, box) => ({
            left: Math.min(all.left, box.left),
            top: Math.min(all.top, box.top),
            right: Math.max(all.right, box.right),
            bottom: Math.max(all.bottom, box.bottom),
          }))
        const shown = (selector: string) => {
          const element = document.querySelector(selector)
          return element && boxOf(element)
        }
        // elementsFromPoint lists what a point hits in paint order; past the legend's rounded corners the floor shows on purpose.
        const painted = (floor: Element, legend: Element): Painted => {
          const outer = boxOf(legend)
          const inner = boxOf(floor)
          const corner = Number.parseFloat(getComputedStyle(legend).borderTopLeftRadius)
          let under = 0
          let over = 0
          for (let y = outer.top; y < Math.min(outer.bottom, inner.bottom); y += 0.5)
            for (let x = Math.max(outer.left + corner, inner.left); x < Math.min(outer.right - corner, inner.right); x++) {
              const stack = document.elementsFromPoint(x, y)
              const at = stack.indexOf(floor)
              if (at < 0) continue
              if (stack.slice(0, at).some(element => legend.contains(element))) under++
              else over++
            }
          return { under, over }
        }
        const legend = document.querySelector(".legend")
        const floor = document.querySelector(".room:not(.hidden) #border")
        const mean = shown(".legend-gradient > .legend-count")
        const bar = shown(".gradient-bar")
        const clipped = [...document.querySelectorAll(".legend li, .legend-name")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent)
        const lines = new Set([...document.querySelectorAll(".legend li")].map(item => item.getBoundingClientRect().top)).size
        return {
          legend: legend && boxOf(legend),
          lines,
          seats: boxOfAll(".seat-dot"),
          tribune: shown(".room:not(.hidden) #tribune"),
          floor: floor && legend && { ...boxOf(floor), ...painted(floor, legend) },
          ramp: mean && bar && { mean, bar },
          clipped,
        }
      }),
    )
    assert.deepEqual(layout.clipped, [], search)
    if (layout.legend === null) continue
    const { legend, seats, tribune, floor } = layout
    assert.ok(legend.left >= 0 && legend.top >= CROPPED && legend.right <= CAPTURE_SETTINGS.width && legend.bottom <= CAPTURE_SETTINGS.height - CROPPED, `${search}: legend ${JSON.stringify(legend)} out of the frame`)
    assert.ok(legend.top >= seats.bottom, `${search}: legend ${JSON.stringify(legend)} over the seats ${JSON.stringify(seats)}`)
    if (tribune) assert.ok(legend.top >= tribune.bottom, `${search}: legend ${JSON.stringify(legend)} over the tribune ${JSON.stringify(tribune)}`)
    if (floor) {
      assert.ok(floor.bottom > legend.top && floor.bottom <= legend.bottom, `${search}: the room's floor ${JSON.stringify(floor)} not under the legend ${JSON.stringify(legend)}`)
      assert.ok(floor.under > 0 && floor.over === 0, `${search}: the room's floor drawn over the legend at ${floor.over} points, under it at ${floor.under}`)
    }
    assert.ok(layout.lines <= 2, `${search}: legend on ${layout.lines} lines`)
    if (layout.ramp) {
      const { mean, bar } = layout.ramp
      assert.ok(mean.right <= bar.left && mean.top < bar.bottom && bar.top < mean.bottom, `${search}: the mean ${JSON.stringify(mean)} not on the ramp's row, before its bar ${JSON.stringify(bar)}`)
    }
  }
})

const OUTCOMES = [
  ["vote=VTANR5L17V8427&color=vote", "Adopté"],
  ["vote=VTANR5L17V8427&color=vote&chart=vote&layout=halfRings", "Adopté"],
  ["vote=VTANR5L17V7979&color=vote&chart=vote&layout=halfRings", "Rejeté"],
  ["vote=VTANR5L17V7979&color=deputies%2Finit.csv%3Agroup&deputy=PA720892", "Rejeté"],
  ["vote=VTANR5L17V8427&chart=vote", null],
  ["", null],
] as const

type Caption = { readonly text: string | null; readonly box: Box; readonly px: number; readonly covered: number; readonly room: Box; readonly tribune: Box | null }

test("a vote's outcome stands in large type in the hollow of an arc, clear of every seat and of the tribune, and a chart without an arc or a vote has none", { timeout: 120_000 }, async t => {
  const browser = await openBrowser(LOCAL)
  t.after(() => browser.close())
  for (const [search, outcome] of OUTCOMES) {
    const { image } = canonicalView(new URLSearchParams(search), data)
    const caption = await withCapturePage(browser, { version: VERSION, query: image }, site, readData, AbortSignal.timeout(30_000), page =>
      page.evaluate((): Caption | null => {
        const boxOf = (element: Element): Box => {
          const { left, top, right, bottom } = element.getBoundingClientRect()
          return { left, top, right, bottom }
        }
        const text = document.querySelector(".hub-caption")
        const room = document.querySelector(".stage svg")
        if (!(text instanceof SVGTextElement) || room === null) return null
        const box = boxOf(text)
        const covered = [...document.querySelectorAll(".seat-dot, .room:not(.hidden) .empty-seat")]
          .map(boxOf)
          .filter(seat => seat.left < box.right && box.left < seat.right && seat.top < box.bottom && box.top < seat.bottom).length
        const tribune = document.querySelector(".room:not(.hidden) #tribune")
        const px = Number.parseFloat(getComputedStyle(text).fontSize) * (text.getScreenCTM()?.a ?? 0)
        return { text: text.textContent, box, px, covered, room: boxOf(room), tribune: tribune && boxOf(tribune) }
      }),
    )
    if (outcome === null) {
      assert.equal(caption, null, search)
      continue
    }
    assert.ok(caption, `${search}: no outcome`)
    const { text, box, px, covered, room, tribune } = caption
    assert.equal(text, outcome, search)
    assert.ok(px >= 15, `${search}: outcome in ${px} px`)
    assert.equal(covered, 0, `${search}: the outcome covers ${covered} seats`)
    assert.ok(box.left >= room.left && box.top >= room.top && box.right <= room.right && box.bottom <= room.bottom, `${search}: outcome ${JSON.stringify(box)} out of the room`)
    if (tribune) assert.ok(box.bottom <= tribune.top, `${search}: outcome ${JSON.stringify(box)} over the tribune ${JSON.stringify(tribune)}`)
  }
})

test("a capture draws the data version it is pinned to, not the one the data root names, and asks for no other", { timeout: 60_000 }, async t => {
  const pinned = given(dataVersion("f".repeat(40)), "pinned version")
  const asked = new Set<string>()
  const anyVersion: ReadDataFile = (version, path) => {
    asked.add(version)
    return readData(VERSION, path)
  }
  const browser = await openBrowser(LOCAL)
  t.after(() => browser.close())
  const { image } = canonicalView(new URLSearchParams("vote=VTANR5L17V8427&color=vote"), data)
  const drawing = await withCapturePage(browser, { version: pinned, query: image }, site, anyVersion, AbortSignal.timeout(30_000), page => page.evaluate(() => document.documentElement.dataset["drawing"]))
  assert.deepEqual([drawing, [...asked]], ["ready", [pinned]])
})

test("a Chromium in another container, reached through a Playwright server, draws the same image and reaches nothing the service does not answer", { timeout: 90_000 }, async () => {
  const server = spawn(process.execPath, [new URL("../node_modules/playwright-core/cli.js", import.meta.url).pathname, "run-server", "--port", "0", "--host", "127.0.0.1", "--path", "/capture"])
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      server.stdout.once("data", (chunk: Buffer) => resolve(/ws:\/\/\S+/.exec(chunk.toString())?.[0] ?? ""))
      server.once("error", reject)
    })
    const remote: BrowserSource = { kind: "connect", endpoint }
    const renderer = createRenderer(site, readData, remote)
    try {
      const jpeg = await renderer.render({ version: VERSION, query: canonicalView(new URLSearchParams("deputy=PA720892"), data).image }, AbortSignal.timeout(30_000))
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
