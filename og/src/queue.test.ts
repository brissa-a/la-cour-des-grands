import assert from "node:assert/strict"
import { test } from "node:test"
import { clientId } from "./client.ts"
import { renderQueue, within, type Job, type Outcome } from "./queue.ts"

const flush = () => new Promise(resolve => setImmediate(resolve))

const ALICE = clientId("192.0.2.1")
const BOB = clientId("192.0.2.2")

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
  const queue = renderQueue<string>({ concurrency: 1, capacity: 4, perClient: 10, timeoutMs: 12_000 })
  const { job, started } = controlled()
  const first = queue.run("a", ALICE, "wait", job)
  const second = queue.run("a", ALICE, "wait", job)
  assert.equal(started.length, 1)
  started[0]?.finish("jpeg")
  assert.deepEqual(await Promise.all([first, second]), [
    { kind: "done", value: "jpeg" },
    { kind: "done", value: "jpeg" },
  ])
  const third = queue.run("a", ALICE, "wait", job)
  assert.equal(started.length, 2)
  started[1]?.finish("again")
  assert.deepEqual(await third, { kind: "done", value: "again" })
})

test("no more renders run than the concurrency allows, and a waiting one starts as soon as a running one ends, failed or not", async () => {
  const queue = renderQueue<string>({ concurrency: 2, capacity: 4, perClient: 10, timeoutMs: 12_000 })
  const { job, started } = controlled()
  const outcomes = ["a", "b", "c", "d"].map(key => queue.run(key, ALICE, "wait", job))
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
  const queue = renderQueue<string>({ concurrency: 1, capacity: 1, perClient: 10, timeoutMs: 12_000 })
  const { job, started } = controlled()
  void queue.run("a", ALICE, "wait", job)
  void queue.run("b", ALICE, "wait", job)
  assert.deepEqual(await queue.run("c", ALICE, "wait", job), { kind: "busy" })
  assert.deepEqual([started.length, queue.running(), queue.waiting()], [1, 1, 1])
  started[0]?.finish("a")
  await flush()
  started[1]?.finish("b")
  await flush()
  assert.equal(started.length, 2)
})

test("a render past its time limit is abandoned: its signal aborts, its requesters get a timeout, and the next render starts", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const queue = renderQueue<string>({ concurrency: 1, capacity: 1, perClient: 10, timeoutMs: 12_000 })
  const { job, started } = controlled()
  const stuck = queue.run("a", ALICE, "wait", job)
  const next = queue.run("b", ALICE, "wait", job)
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

function named(): { readonly ask: (key: string) => Job<string>; readonly order: string[]; readonly started: Pending[] } {
  const { job, started } = controlled()
  const order: string[] = []
  return {
    order,
    started,
    ask: key => signal => {
      order.push(key)
      return job(signal)
    },
  }
}

async function finishInTurn(started: Pending[], from: number, count: number): Promise<void> {
  for (let index = from; index < from + count; index += 1) {
    started[index]?.finish("done")
    await flush()
  }
}

test("past its share, a client's renders wait behind every other client's, its running renders counted in the share", async () => {
  const queue = renderQueue<string>({ concurrency: 1, capacity: 4, perClient: 1, timeoutMs: 12_000 })
  const { ask, order, started } = named()
  const first = queue.run("a", ALICE, "wait", ask("a"))
  void queue.run("b", BOB, "wait", ask("b"))
  void queue.run("c", ALICE, "wait", ask("c"))
  assert.equal(queue.run("a", BOB, "wait", ask("a")), first)
  assert.deepEqual([queue.running(), queue.waiting(), queue.clients()], [1, 2, 2])
  started[0]?.finish("a")
  await first
  await flush()
  void queue.run("d", ALICE, "wait", ask("d"))
  await finishInTurn(started, 1, 2)
  assert.deepEqual(order, ["a", "b", "d", "c"])
  void queue.run("e", BOB, "wait", ask("e"))
  void queue.run("f", ALICE, "wait", ask("f"))
  await finishInTurn(started, 3, 3)
  assert.deepEqual(order, ["a", "b", "d", "c", "e", "f"])
  assert.deepEqual([queue.running(), queue.waiting(), queue.clients()], [0, 0, 0])
})

test("a burst from one client is queued whole while its line has room, and a full surplus line still lets other clients in", async () => {
  const queue = renderQueue<string>({ concurrency: 2, capacity: 4, perClient: 2, timeoutMs: 12_000 })
  const { ask, order, started } = named()
  const burst = ["k1", "k2", "k3", "k4", "k5", "k6"].map(key => queue.run(key, ALICE, "wait", ask(key)))
  assert.deepEqual(await queue.run("k7", ALICE, "wait", ask("k7")), { kind: "busy" })
  const other = queue.run("b", BOB, "wait", ask("b"))
  assert.deepEqual([queue.running(), queue.waiting()], [2, 5])
  await finishInTurn(started, 0, 7)
  assert.deepEqual(order, ["k1", "k2", "b", "k3", "k4", "k5", "k6"])
  assert.deepEqual(
    (await Promise.all([...burst, other])).map(({ kind }) => kind),
    Array.from({ length: 7 }, () => "done"),
  )
})

test("a render asked only if a slot is idle starts at once when one is, and is refused rather than queued when none is", async () => {
  const queue = renderQueue<string>({ concurrency: 1, capacity: 4, perClient: 4, timeoutMs: 12_000 })
  const { job, started } = controlled()
  const ahead = queue.run("a", ALICE, "idleOnly", job)
  assert.deepEqual([started.length, queue.running()], [1, 1])
  assert.deepEqual(await queue.run("b", BOB, "idleOnly", job), { kind: "busy" })
  assert.equal(queue.waiting(), 0)
  void queue.run("c", BOB, "wait", job)
  started[0]?.finish("a")
  await ahead
  await flush()
  assert.deepEqual([started.length, queue.waiting()], [2, 0])
})
