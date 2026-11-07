import assert from "node:assert/strict"
import { test } from "node:test"
import { clientId } from "./client.ts"
import { perClientDownloads, type DownloadLimits } from "./downloads.ts"

const SCHOOL = clientId("203.0.113.7")
const OTHER = clientId("198.51.100.1")

function settled<T>(promise: Promise<T>): Promise<T | "waiting"> {
  return Promise.race([promise, new Promise<"waiting">(resolve => setImmediate(() => resolve("waiting")))])
}

function started(limits: DownloadLimits) {
  const downloads = perClientDownloads(limits)
  return {
    downloads,
    enter: (client = SCHOOL) => {
      const done = new AbortController()
      return { done, entry: downloads.enter(client, done.signal) }
    },
  }
}

test("a client runs its limit of downloads at once; the next ones wait in line and start, first come first, as places free up", { timeout: 2_000 }, async () => {
  const { downloads, enter } = started({ perClient: 2, waiting: 4, waitMs: 60_000 })
  const running = [enter(), enter()]
  assert.deepEqual(await Promise.all(running.map(one => one.entry)), ["started", "started"])
  const [first, second] = [enter(), enter()]
  assert.deepEqual([await settled(first.entry), await settled(second.entry)], ["waiting", "waiting"])
  assert.deepEqual(downloads.counts(), { clients: 1, running: 2, waiting: 2, waited: 2, refused: 0 })
  running[1]?.done.abort()
  assert.deepEqual([await settled(first.entry), await settled(second.entry)], ["started", "waiting"])
  assert.deepEqual(downloads.counts(), { clients: 1, running: 2, waiting: 1, waited: 2, refused: 0 })
  first.done.abort()
  assert.equal(await settled(second.entry), "started")
  for (const one of [running[0], second]) one?.done.abort()
  assert.deepEqual(downloads.counts(), { clients: 0, running: 0, waiting: 0, waited: 2, refused: 0 })
})

test("a download that ends gives back its own place only, the client's others still counting against its limit", { timeout: 2_000 }, async () => {
  const { downloads, enter } = started({ perClient: 2, waiting: 1, waitMs: 60_000 })
  const [ending, staying] = [enter(), enter()]
  assert.deepEqual(await Promise.all([ending.entry, staying.entry]), ["started", "started"])
  ending.done.abort()
  assert.deepEqual(downloads.counts(), { clients: 1, running: 1, waiting: 0, waited: 0, refused: 0 })
  const [third, fourth] = [enter(), enter()]
  assert.deepEqual([await settled(third.entry), await settled(fourth.entry)], ["started", "waiting"])
  for (const one of [staying, third, fourth]) one.done.abort()
  assert.deepEqual(downloads.counts(), { clients: 0, running: 0, waiting: 0, waited: 1, refused: 0 })
})

test("a request kept waiting past the bound is refused, and its place in line freed", { timeout: 2_000 }, async () => {
  const { downloads, enter } = started({ perClient: 1, waiting: 4, waitMs: 50 })
  const running = enter()
  assert.equal(await running.entry, "started")
  const since = performance.now()
  assert.equal(await enter().entry, "refused")
  assert.ok(performance.now() - since >= 45, "it waited first")
  assert.deepEqual(downloads.counts(), { clients: 1, running: 1, waiting: 0, waited: 1, refused: 1 })
  running.done.abort()
  assert.deepEqual(downloads.counts(), { clients: 0, running: 0, waiting: 0, waited: 1, refused: 1 })
})

test("once its line is full, a client's next request is refused at once", { timeout: 2_000 }, async () => {
  const { downloads, enter } = started({ perClient: 1, waiting: 2, waitMs: 60_000 })
  const all = [enter(), enter(), enter()]
  assert.deepEqual(await Promise.all(all.map(one => settled(one.entry))), ["started", "waiting", "waiting"])
  assert.equal(await enter().entry, "refused")
  assert.deepEqual(downloads.counts(), { clients: 1, running: 1, waiting: 2, waited: 2, refused: 1 })
  for (const one of all) one.done.abort()
  assert.deepEqual(downloads.counts(), { clients: 0, running: 0, waiting: 0, waited: 2, refused: 1 })
})

test("a request whose connection closes while it waits leaves the line, and the next in line takes the place it would have had", { timeout: 2_000 }, async () => {
  const { downloads, enter } = started({ perClient: 1, waiting: 4, waitMs: 60_000 })
  const [running, leaving, next] = [enter(), enter(), enter()]
  assert.equal(await running.entry, "started")
  leaving.done.abort()
  assert.equal(await leaving.entry, "refused")
  assert.deepEqual(downloads.counts(), { clients: 1, running: 1, waiting: 1, waited: 2, refused: 0 })
  running.done.abort()
  assert.equal(await next.entry, "started")
  next.done.abort()
  assert.deepEqual(downloads.counts(), { clients: 0, running: 0, waiting: 0, waited: 2, refused: 0 })
})

test("a request whose connection has already closed takes no place", { timeout: 2_000 }, async () => {
  const downloads = perClientDownloads({ perClient: 1, waiting: 0, waitMs: 60_000 })
  assert.equal(await downloads.enter(SCHOOL, AbortSignal.abort()), "refused")
  assert.deepEqual(downloads.counts(), { clients: 0, running: 0, waiting: 0, waited: 0, refused: 0 })
  assert.equal(await downloads.enter(SCHOOL, new AbortController().signal), "started")
})

test("one client's downloads never hold back another's", { timeout: 2_000 }, async () => {
  const { downloads, enter } = started({ perClient: 1, waiting: 0, waitMs: 60_000 })
  assert.deepEqual(await Promise.all([enter(SCHOOL).entry, enter(SCHOOL).entry, enter(OTHER).entry]), ["started", "refused", "started"])
  assert.deepEqual(downloads.counts(), { clients: 2, running: 2, waiting: 0, waited: 0, refused: 1 })
})
