import assert from "node:assert/strict"
import { test } from "node:test"
import type { DataVersion } from "../../web/src/data/version.ts"
import type { ShareData } from "../../web/src/share/data.ts"
import { DATA, NEW as V2, OLD as V1 } from "./fixture.test.ts"
import { watchReleases, type Ready, type Releases } from "./releases.ts"
import type { PointerCheck } from "./snapshot.ts"

const EVERY_MS = 30_000

const flush = async () => {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve))
}

function versions(state: Releases): readonly (string | null)[] {
  if (state.kind === "starting") return ["starting"]
  return [state.current.version, state.previous === null ? null : state.previous.version]
}

const pointing = (version: DataVersion, publishedAt = "2026-11-07T04:00:00.000Z"): Extract<PointerCheck, { kind: "found" }> => ({ kind: "found", version, pointer: JSON.stringify({ version, publishedAt }) })

type Script = { readonly checks: readonly (PointerCheck | Promise<PointerCheck>)[]; readonly failing?: Set<DataVersion>; readonly hookFails?: boolean }

function scripted({ checks, failing = new Set(), hookFails = false }: Script) {
  let reads = 0
  const loads: DataVersion[] = []
  const released: Ready[] = []
  const logged: string[] = []
  const queue = [...checks]
  const watch = watchReleases({
    check: () => {
      reads += 1
      return Promise.resolve(queue.shift() ?? { kind: "failed", reason: "script over" })
    },
    load: (version): Promise<ShareData> => {
      loads.push(version)
      if (failing.delete(version)) return Promise.reject(new Error("catalog.json: not in the data version"))
      return Promise.resolve(DATA)
    },
    onRelease: ready => {
      released.push(ready)
      return hookFails ? Promise.reject(new Error("disk full")) : Promise.resolve()
    },
    log: (event, fields) => logged.push(`${event} ${JSON.stringify(fields)}`),
    everyMs: EVERY_MS,
  })
  return { watch, reads: () => reads, loads, released, logged }
}

test("the version the pointer names is loaded at start, and a new one it names later is loaded, then switched in with the old one kept", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch, loads, released, logged } = scripted({ checks: [pointing(V1), pointing(V2)] })
  await flush()
  assert.deepEqual([versions(watch.state()), watch.pointer()], [[V1, null], pointing(V1).pointer])
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual([versions(watch.state()), watch.pointer()], [[V2, V1], pointing(V2).pointer])
  assert.deepEqual(loads, [V1, V2])
  assert.deepEqual(released.map(versions), [
    [V1, null],
    [V2, V1],
  ])
  assert.deepEqual(logged, [`release {"version":"${V1}"}`, `release {"version":"${V2}"}`])
  watch.stop()
})

test("the same version named again is not loaded again, and the pointer served is the one last read", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const again = pointing(V1, "2026-11-08T04:00:00.000Z")
  const { watch, loads, released } = scripted({ checks: [pointing(V1), again] })
  await flush()
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual([versions(watch.state()), watch.pointer(), loads, released.length], [[V1, null], again.pointer, [V1], 1])
  watch.stop()
})

test("a version whose data fails to load, or a pointer that cannot be read, leaves the current version and its pointer in place, is logged, and is tried again at the next read", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch, loads, logged } = scripted({
    checks: [pointing(V1), pointing(V2), { kind: "failed", reason: "current.json names no version" }, pointing(V2)],
    failing: new Set([V2]),
  })
  await flush()
  for (let read = 0; read < 2; read++) {
    t.mock.timers.tick(EVERY_MS)
    await flush()
    assert.deepEqual([versions(watch.state()), watch.pointer()], [[V1, null], pointing(V1).pointer])
  }
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual([versions(watch.state()), watch.pointer()], [[V2, V1], pointing(V2).pointer])
  assert.deepEqual(loads, [V1, V2, V2])
  assert.deepEqual(logged, [
    `release {"version":"${V1}"}`,
    `release-failed {"version":"${V2}","reason":"catalog.json: not in the data version"}`,
    'pointer-unreadable {"reason":"current.json names no version"}',
    `release {"version":"${V2}"}`,
  ])
  watch.stop()
})

test("a release whose follow-up fails is still served, and the failure is logged", async () => {
  const { watch, logged } = scripted({ checks: [pointing(V1)], hookFails: true })
  await flush()
  assert.deepEqual(versions(watch.state()), [V1, null])
  assert.deepEqual(logged, [`release {"version":"${V1}"}`, `release-hook-failed {"version":"${V1}","reason":"disk full"}`])
  watch.stop()
})

test("until a pointer names a version that loads, the service is starting and serves no pointer", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch } = scripted({ checks: [{ kind: "failed", reason: "ENOENT" }, pointing(V2), pointing(V1)], failing: new Set([V2]) })
  for (let read = 0; read < 2; read++) {
    await flush()
    assert.deepEqual([watch.state(), watch.pointer()], [{ kind: "starting" }, null])
    t.mock.timers.tick(EVERY_MS)
  }
  await flush()
  assert.deepEqual([versions(watch.state()), watch.pointer()], [[V1, null], pointing(V1).pointer])
  watch.stop()
})

test("once stopped, between reads or during one, no further read is made", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const between = scripted({ checks: [] })
  await flush()
  between.watch.stop()
  t.mock.timers.tick(EVERY_MS * 3)
  await flush()
  assert.equal(between.reads(), 1)
  const pending = Promise.withResolvers<PointerCheck>()
  const during = scripted({ checks: [pending.promise] })
  await flush()
  during.watch.stop()
  pending.resolve(pointing(V1))
  await flush()
  t.mock.timers.tick(EVERY_MS * 3)
  await flush()
  assert.equal(during.reads(), 1)
})
