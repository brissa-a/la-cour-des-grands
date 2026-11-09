import assert from "node:assert/strict"
import { test, type TestContext } from "node:test"
import { createFallback } from "./fallback.ts"
import { DATA, NEW, OLD } from "./fixture.test.ts"
import type { Release } from "./releases.ts"

const RETRY_MS = 60_000
const FIRST: Release = { version: OLD, data: DATA }
const SECOND: Release = { version: NEW, data: DATA }

const flush = async () => {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve))
}

type Draw = { readonly release: Release; readonly finish: (jpeg: Buffer | null) => void; readonly fail: (error: Error) => void }

function scripted(t: TestContext, saved: Buffer | null = null, saving: "works" | "fails" = "works") {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const draws: Draw[] = []
  const savedImages: string[] = []
  const logged: string[] = []
  const fallback = createFallback({
    draw: release => {
      const { promise, resolve, reject } = Promise.withResolvers<Buffer | null>()
      draws.push({ release, finish: resolve, fail: reject })
      return promise
    },
    save: jpeg => {
      savedImages.push(jpeg.toString())
      return saving === "works" ? Promise.resolve() : Promise.reject(new Error("ENOSPC: no space left on device"))
    },
    saved,
    retryMs: RETRY_MS,
    log: (event, fields) => logged.push(`${event} ${fields["version"] ?? ""} ${fields["reason"] ?? ""}`.trim()),
  })
  t.after(() => fallback.stop())
  return { fallback, draws, savedImages, logged }
}

test("the generic image is the one saved by the last run until each data version's own is drawn, then that one, saved for the next run", async t => {
  const { fallback, draws, savedImages } = scripted(t, Buffer.from("saved"))
  assert.equal(fallback.image()?.toString(), "saved")
  fallback.follow(FIRST)
  draws[0]?.finish(Buffer.from("first"))
  await flush()
  fallback.follow(SECOND)
  assert.equal(fallback.image()?.toString(), "first")
  draws[1]?.finish(Buffer.from("second"))
  await flush()
  assert.equal(fallback.image()?.toString(), "second")
  assert.deepEqual([draws.map(({ release }) => release.version), savedImages], [[OLD, NEW], ["first", "second"]])
})

test("a draw that fails or gives no image is logged and tried again a minute later, keeping the image there is", async t => {
  const { fallback, draws, logged } = scripted(t, Buffer.from("saved"))
  fallback.follow(FIRST)
  draws[0]?.fail(new Error("the capture page reported data-drawing=\"error\""))
  await flush()
  t.mock.timers.tick(RETRY_MS - 1)
  assert.equal(draws.length, 1)
  t.mock.timers.tick(1)
  assert.equal(draws.length, 2)
  draws[1]?.finish(null)
  await flush()
  t.mock.timers.tick(RETRY_MS)
  draws[2]?.finish(Buffer.from("first"))
  await flush()
  assert.equal(fallback.image()?.toString(), "first")
  assert.deepEqual(logged, [`fallback-failed ${OLD} the capture page reported data-drawing="error"`, `fallback-failed ${OLD} no image`])
})

test("a draw for a version already replaced neither replaces the newer image nor tries again", async t => {
  const { fallback, draws } = scripted(t)
  fallback.follow(FIRST)
  fallback.follow(SECOND)
  draws[1]?.finish(Buffer.from("second"))
  draws[0]?.finish(Buffer.from("first, late"))
  await flush()
  assert.equal(fallback.image()?.toString(), "second")
  fallback.follow(FIRST)
  fallback.follow(SECOND)
  draws[2]?.fail(new Error("timed out"))
  await flush()
  t.mock.timers.tick(RETRY_MS * 3)
  assert.deepEqual(draws.map(({ release }) => release.version), [OLD, NEW, OLD, NEW])
})

test("once stopped, no retry is made", async t => {
  const { fallback, draws } = scripted(t)
  fallback.follow(FIRST)
  draws[0]?.fail(new Error("timed out"))
  await flush()
  fallback.stop()
  t.mock.timers.tick(RETRY_MS * 3)
  assert.equal(draws.length, 1)
})

test("once stopped, a draw still running is dropped", async t => {
  const { fallback, draws } = scripted(t)
  fallback.follow(FIRST)
  fallback.stop()
  draws[0]?.finish(Buffer.from("first, after the stop"))
  await flush()
  assert.equal(fallback.image(), null)
})

test("an image the disk refuses is still served, and the refusal is logged", async t => {
  const { fallback, draws, logged } = scripted(t, null, "fails")
  fallback.follow(FIRST)
  draws[0]?.finish(Buffer.from("first"))
  await flush()
  assert.equal(fallback.image()?.toString(), "first")
  assert.deepEqual(logged, [`fallback-unsaved ${OLD} ENOSPC: no space left on device`])
})

test("a new data version cancels the retry waiting for the older one", async t => {
  const { fallback, draws } = scripted(t)
  fallback.follow(FIRST)
  draws[0]?.fail(new Error("timed out"))
  await flush()
  fallback.follow(SECOND)
  t.mock.timers.tick(RETRY_MS * 3)
  assert.deepEqual(draws.map(({ release }) => release.version), [OLD, NEW])
})
