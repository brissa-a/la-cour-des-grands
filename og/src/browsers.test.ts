import assert from "node:assert/strict"
import { test } from "node:test"
import { recycler } from "./browsers.ts"

type FakeBrowser = { readonly id: number; closed: boolean; readonly lose: () => void }

function fakes(failFirst = false) {
  const launched: FakeBrowser[] = []
  const pool = recycler<FakeBrowser>({
    launch: lost => {
      if (failFirst && launched.length === 0) {
        launched.push({ id: 0, closed: true, lose: lost })
        return Promise.reject(new Error("no chromium"))
      }
      const browser = { id: launched.length, closed: false, lose: lost }
      launched.push(browser)
      return Promise.resolve(browser)
    },
    close: async browser => {
      await new Promise(resolve => setTimeout(resolve, 5))
      browser.closed = true
    },
    maxUses: 2,
  })
  return { pool, launched }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 20))

test("one warm browser serves the renders until its quota, then a fresh one takes over and the old one closes", async () => {
  const { pool, launched } = fakes()
  const used = [await pool.use(b => Promise.resolve(b.id)), await pool.use(b => Promise.resolve(b.id)), await pool.use(b => Promise.resolve(b.id))]
  await flush()
  assert.deepEqual(used, [0, 0, 1])
  assert.deepEqual(
    launched.map(b => b.closed),
    [true, false],
  )
})

test("a browser past its quota closes only once the renders still running on it end", async () => {
  const { pool, launched } = fakes()
  const { promise: slow, resolve: finish } = Promise.withResolvers<number>()
  const running = pool.use(() => slow)
  await pool.use(b => Promise.resolve(b.id))
  await pool.use(b => Promise.resolve(b.id))
  await flush()
  assert.deepEqual(
    launched.map(b => b.closed),
    [false, false],
  )
  finish(7)
  assert.equal(await running, 7)
  await flush()
  assert.deepEqual(
    launched.map(b => b.closed),
    [true, false],
  )
})

test("a retired browser stays open while any of its renders still runs", async () => {
  const { pool, launched } = fakes()
  const first = Promise.withResolvers<number>()
  const second = Promise.withResolvers<number>()
  const running = [pool.use(() => first.promise), pool.use(() => second.promise)]
  await pool.use(b => Promise.resolve(b.id))
  first.resolve(1)
  await flush()
  assert.deepEqual(
    launched.map(b => b.closed),
    [false, false],
  )
  second.resolve(2)
  assert.deepEqual(await Promise.all(running), [1, 2])
  await flush()
  assert.deepEqual(
    launched.map(b => b.closed),
    [true, false],
  )
})

test("a browser that crashed or never started is replaced at the next render", async () => {
  const { pool, launched } = fakes(true)
  await assert.rejects(pool.use(b => Promise.resolve(b.id)), /no chromium/)
  assert.equal(await pool.use(b => Promise.resolve(b.id)), 1)
  launched[1]?.lose()
  assert.equal(await pool.use(b => Promise.resolve(b.id)), 2)
})

test("a retired browser going away, as it does once closed, leaves the current one serving", async () => {
  const { pool, launched } = fakes()
  for (let render = 0; render < 3; render++) await pool.use(b => Promise.resolve(b.id))
  launched[0]?.lose()
  assert.equal(await pool.use(b => Promise.resolve(b.id)), 1)
  assert.equal(launched.length, 2)
})

test("closing the pool waits until the idle browser is closed, and closing an unused pool does nothing", async () => {
  const { pool, launched } = fakes()
  await pool.use(b => Promise.resolve(b.id))
  await pool.close()
  assert.deepEqual(
    launched.map(b => b.closed),
    [true],
  )
  const unused = fakes()
  await unused.pool.close()
  assert.equal(unused.launched.length, 0)
})
