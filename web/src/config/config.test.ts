import assert from "node:assert/strict"
import { test } from "node:test"
import { createConfigStore } from "./config.ts"

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: () => value,
    setItem: (_: string, next: string) => {
      value = next
    },
    removeItem: () => {
      value = null
    },
    saved: () => value,
  }
}

test("missing keys take their default, saved values survive a reload", () => {
  const storage = memoryStorage()
  const store = createConfigStore(storage)
  assert.equal(store.get().preview.holdMs, 200)
  assert.deepEqual(store.save('{ "preview": { "holdMs": 300 } }'), { ok: true, config: store.get(), persisted: true })
  assert.equal(store.get().preview.speedWindowMs, 100)
  assert.equal(createConfigStore(storage).get().preview.holdMs, 300)
})

test("invalid JSON, unknown keys and wrong values are reported and nothing is applied", () => {
  const store = createConfigStore(memoryStorage())
  const before = store.get()
  const broken = store.save("{ preview: }")
  assert.equal(broken.ok, false)
  const wrong = store.save('{ "preview": { "openSpeedPxPerS": "fast", "holdMs": -1, "extra": true, "constructor": 1 }, "other": 1, "toString": 1 }')
  assert.deepEqual(wrong.ok ? [] : wrong.errors, [
    "other : clé inconnue",
    "toString : clé inconnue",
    "preview.extra : clé inconnue",
    "preview.constructor : clé inconnue",
    "preview.openSpeedPxPerS doit être un entier entre 0 et 2000",
    "preview.holdMs doit être un entier entre 0 et 2000",
  ])
  assert.equal(store.get(), before)
})

test("decimal options take fractions within their range", () => {
  const store = createConfigStore(memoryStorage())
  assert.equal(store.save('{ "zoom": { "scrollRate": 0.0035 } }').ok, true)
  assert.equal(store.get().zoom.scrollRate, 0.0035)
  const wrong = store.save('{ "zoom": { "scrollRate": 1, "pinchRate": "0.01" } }')
  assert.deepEqual(wrong.ok ? [] : wrong.errors, [
    "zoom.scrollRate doit être un nombre entre 0 et 0.02",
    "zoom.pinchRate doit être un nombre entre 0 et 0.1",
  ])
  assert.equal(store.get().zoom.scrollRate, 0.0035)
})

test("saving keeps unchanged branches identical so only affected readers update", () => {
  const store = createConfigStore(memoryStorage())
  const before = store.get()
  let notified = 0
  store.subscribe(() => notified++)
  store.save(store.text())
  assert.equal(store.get(), before)
  assert.equal(notified, 0)
  store.save('{ "preview": { "holdMs": 300 } }')
  assert.notEqual(store.get().preview, before.preview)
  assert.equal(notified, 1)
})

test("a corrupt saved config falls back to the defaults", () => {
  const store = createConfigStore(memoryStorage('{ "preview": { "holdMs": "long" } }'))
  assert.equal(store.get().preview.holdMs, 200)
})

test("reset forgets the saved config", () => {
  const storage = memoryStorage()
  const store = createConfigStore(storage)
  store.save('{ "preview": { "holdMs": 300 } }')
  store.reset()
  assert.equal(store.get().preview.holdMs, 200)
  assert.equal(storage.saved(), null)
})

test("a config that cannot be stored still applies and says so", () => {
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError")
    },
    removeItem: () => {},
  }
  for (const storage of [full, null]) {
    const store = createConfigStore(storage)
    assert.deepEqual(store.save('{ "preview": { "holdMs": 300 } }'), { ok: true, config: store.get(), persisted: false })
    assert.equal(store.get().preview.holdMs, 300)
  }
})
