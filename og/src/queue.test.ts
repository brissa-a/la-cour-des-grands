import assert from "node:assert/strict"
import { test } from "node:test"
import { renderQueue, within, type Job, type Outcome } from "./queue.ts"

const flush = () => new Promise(resolve => setImmediate(resolve))

type Pending = { readonly signal: AbortSignal; readonly finish: (value: string) => void; readonly fail: (error: Error) => void }

function controlled(): { readonly job: Job<string>; readonly started: Pending[] } {
  const started: Pending[] = []
  return {
    started,
    job: signal => {
      const { promise, resolve, reject } = Promise.withResolvers<string>()
      started.push({ signal, finish: resolve, fail: reject })
      return promise
    },
  }
}

test("requests for a view that is already rendering share that one render", async () => {
  const queue = renderQueue<string>({ concurrency: 1, capacity: 4, timeoutMs: 12_000 })
  const { job, started } = controlled()
  const first = queue.run("a", job)
  const second = queue.run("a", job)
  assert.equal(started.length, 1)
  started[0]?.finish("jpeg")
  assert.deepEqual(await Promise.all([first, second]), [
    { kind: "done", value: "jpeg" },
    { kind: "done", value: "jpeg" },
  ])
  const third = queue.run("a", job)
  assert.equal(started.length, 2)
  started[1]?.finish("again")
  assert.deepEqual(await third, { kind: "done", value: "again" })
})

test("no more renders run than the concurrency allows, and a waiting one starts as soon as a running one ends, failed or not", async () => {
  const queue = renderQueue<string>({ concurrency: 2, capacity: 4, timeoutMs: 12_000 })
  const { job, started } = controlled()
  const outcomes = ["a", "b", "c", "d"].map(key => queue.run(key, job))
  assert.deepEqual([started.length, queue.running(), queue.waiting()], [2, 2, 2])
  started[0]?.fail(new Error("crash"))
  assert.deepEqual(await outcomes[0], { kind: "failed", error: new Error("crash") })
  await flush()
  assert.deepEqual([started.length, queue.running(), queue.waiting()], [3, 2, 1])
  started[1]?.finish("b")
  await outcomes[1]
  await flush()
  assert.deepEqual([started.length, queue.running(), queue.waiting()], [4, 2, 0])
})

test("a full queue answers busy at once, without starting or keeping the render", async () => {
  const queue = renderQueue<string>({ concurrency: 1, capacity: 1, timeoutMs: 12_000 })
  const { job, started } = controlled()
  void queue.run("a", job)
  void queue.run("b", job)
  assert.deepEqual(await queue.run("c", job), { kind: "busy" })
  assert.deepEqual([started.length, queue.running(), queue.waiting()], [1, 1, 1])
  started[0]?.finish("a")
  await flush()
  started[1]?.finish("b")
  await flush()
  assert.equal(started.length, 2)
})

test("a render past its time limit is abandoned: its signal aborts, its requesters get a timeout, and the next render starts", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const queue = renderQueue<string>({ concurrency: 1, capacity: 1, timeoutMs: 12_000 })
  const { job, started } = controlled()
  const stuck = queue.run("a", job)
  const next = queue.run("b", job)
  t.mock.timers.tick(11_999)
  await flush()
  assert.deepEqual([started.length, started[0]?.signal.aborted], [1, false])
  t.mock.timers.tick(1)
  assert.deepEqual(await stuck, { kind: "timeout" })
  assert.equal(started[0]?.signal.aborted, true)
  await flush()
  assert.equal(started.length, 2)
  started[1]?.finish("b")
  assert.deepEqual(await next, { kind: "done", value: "b" })
  t.mock.timers.tick(12_000)
  assert.equal(started[1]?.signal.aborted, false)
})

test("a requester who cannot wait longer gets late, and one whose render ends in time gets the render", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { promise, resolve } = Promise.withResolvers<Outcome<string>>()
  const waited = within(promise, 8_000)
  t.mock.timers.tick(8_000)
  assert.equal(await waited, "late")
  const quick = within(Promise.resolve<Outcome<string>>({ kind: "done", value: "jpeg" }), 8_000)
  assert.deepEqual(await quick, { kind: "done", value: "jpeg" })
  resolve({ kind: "done", value: "late jpeg" })
  assert.deepEqual(await promise, { kind: "done", value: "late jpeg" })
})
