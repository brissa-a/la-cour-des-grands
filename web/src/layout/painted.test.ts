import assert from "node:assert/strict"
import { test } from "node:test"
import { changeAfter, paintedAfter, photosLoaded } from "./painted.ts"

const flushed = () => new Promise(resolve => setImmediate(resolve))

function deferred() {
  let resolve: () => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function frames() {
  const waiting: ((time: number) => void)[] = []
  return {
    nextFrame: () => new Promise<number>(resolve => waiting.push(resolve)),
    requested: () => waiting.length,
    paint: async (time: number) => {
      for (const resolve of waiting.splice(0)) resolve(time)
      await flushed()
    },
  }
}

function watched(promise: Promise<boolean>) {
  const seen: { done: boolean | null } = { done: null }
  void promise.then(done => {
    seen.done = done
  })
  return seen
}

test("the wait for the last dot asks for no frame before the fonts and photos are loaded", async () => {
  const loaded = deferred()
  const clock = frames()
  const seen = watched(paintedAfter(0, { loaded: loaded.promise, nextFrame: clock.nextFrame }, () => true))
  await flushed()
  assert.deepEqual([clock.requested(), seen.done], [0, null])
  loaded.resolve()
  await flushed()
  assert.equal(clock.requested(), 1)
})

test("the wait counts in frame timestamps from the second frame after loading, so the drawing is painted when the last dot lands", async () => {
  const clock = frames()
  const seen = watched(paintedAfter(100, { loaded: Promise.resolve(), nextFrame: clock.nextFrame }, () => true))
  await flushed()
  await clock.paint(16)
  await clock.paint(32)
  await clock.paint(131.9)
  assert.equal(seen.done, null)
  await clock.paint(132)
  assert.equal(seen.done, true)
  assert.equal(clock.requested(), 0)
})

test("a wait that a newer change replaced stops at the next frame and reports the drawing unpainted", async () => {
  const clock = frames()
  let live = true
  const seen = watched(paintedAfter(100, { loaded: Promise.resolve(), nextFrame: clock.nextFrame }, () => live))
  await flushed()
  await clock.paint(16)
  await clock.paint(32)
  await clock.paint(48)
  live = false
  await clock.paint(64)
  assert.deepEqual([seen.done, clock.requested()], [false, 0])
  const late = frames()
  const replacedWhileLoading = watched(paintedAfter(0, { loaded: Promise.resolve(), nextFrame: late.nextFrame }, () => false))
  await flushed()
  await late.paint(16)
  await late.paint(32)
  assert.equal(replacedWhileLoading.done, false)
})

test("the scene, colour or photos changing start a new wait, and the same ones keep the wait they are in", () => {
  const scene = {}
  const paint = {}
  const first = changeAfter(null, [scene, paint], 10)
  assert.deepEqual(first, { by: [scene, paint], at: 10 })
  assert.equal(changeAfter(first, [scene, paint], 20), first)
  assert.deepEqual(changeAfter(first, [scene, {}], 20).at, 20)
  assert.deepEqual(changeAfter(first, [{}, paint], 20).at, 20)
  assert.deepEqual(changeAfter(first, [scene, paint, []], 20).at, 20)
  assert.deepEqual(changeAfter(first, [scene], 20).at, 20)
})

test("photos are loaded once every one has loaded or failed, so a missing photo never holds the drawing back", async () => {
  const slow = deferred()
  const broken = deferred()
  const asked: string[] = []
  const load = (url: string) => {
    asked.push(url)
    return url === "slow.webp" ? slow.promise : url === "broken.webp" ? broken.promise : Promise.resolve()
  }
  let done = false
  void photosLoaded(["a.webp", "slow.webp", "broken.webp"], load).then(() => {
    done = true
  })
  broken.reject(new Error("404"))
  await flushed()
  assert.deepEqual([asked, done], [["a.webp", "slow.webp", "broken.webp"], false])
  slow.resolve()
  await flushed()
  assert.equal(done, true)
})
