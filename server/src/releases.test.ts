import assert from "node:assert/strict"
import { test } from "node:test"
import { dataVersion, type DataVersion } from "../../web/src/data/version.ts"
import type { ShareData } from "../../web/src/share/data.ts"
import { DATA, given, NEW as V2, OLD as V1, SHA as V3 } from "./fixture.test.ts"
import { watchReleases, type Ready, type Releases } from "./releases.ts"
import type { Pointed, PointerCheck } from "./snapshot.ts"

const EVERY_MS = 30_000

const BAD = given(dataVersion("b".repeat(40)), "unloadable version")

const flush = async () => {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve))
}

function versions(state: Releases): readonly (string | null)[] {
  if (state.kind === "starting") return ["starting"]
  return [state.current.version, state.previous === null ? null : state.previous.version]
}

const pointing = (version: DataVersion, publishedAt = "2026-11-07T04:00:00.000Z"): Extract<PointerCheck, { kind: "found" }> => ({ kind: "found", version, pointer: JSON.stringify({ version, publishedAt }) })

const onDisk = (version: DataVersion): Pointed => ({ version, pointer: JSON.stringify({ version, publishedAt: "2026-11-01T04:00:00.000Z" }) })

type Script = {
  readonly checks: readonly (PointerCheck | Promise<PointerCheck>)[]
  readonly disk?: readonly Pointed[]
  readonly failing?: Set<DataVersion>
  readonly broken?: ReadonlySet<DataVersion>
  readonly undrawn?: ReadonlySet<DataVersion>
  readonly hookFails?: boolean
}

function scripted({ checks, disk = [], failing = new Set(), broken = new Set(), undrawn = new Set(), hookFails = false }: Script) {
  let reads = 0
  let kept: readonly Pointed[] | Error = disk
  const loads: DataVersion[] = []
  const released: Ready[] = []
  const logged: string[] = []
  const queue = [...checks]
  const watch = watchReleases({
    check: () => {
      reads += 1
      return Promise.resolve(queue.shift() ?? { kind: "failed", reason: "script over" })
    },
    kept: () => (kept instanceof Error ? Promise.reject(kept) : Promise.resolve(kept)),
    load: (version): Promise<ShareData> => {
      loads.push(version)
      if (failing.delete(version) || broken.has(version)) return Promise.reject(new Error("catalog.json: not in the data version"))
      return Promise.resolve(undrawn.has(version) ? { ...DATA, drawing: { kind: "unknown", reason: "seats/hemicycle.csv: not in the data version" } } : DATA)
    },
    onRelease: ready => {
      released.push(ready)
      return hookFails ? Promise.reject(new Error("disk full")) : Promise.resolve()
    },
    log: (event, fields) => logged.push(`${event} ${JSON.stringify(fields)}`),
    everyMs: EVERY_MS,
  })
  const keep = (now: readonly Pointed[] | Error) => {
    kept = now
  }
  return { watch, reads: () => reads, keep, loads, released, logged }
}

const served = (watch: ReturnType<typeof scripted>["watch"]) => [versions(watch.state()), watch.pointer(), watch.pointed()]

test("the version the pointer names is loaded at start, and a new one it names later is loaded, then switched in with the old one kept", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch, loads, released, logged } = scripted({ checks: [pointing(V1), pointing(V2)] })
  await watch.started
  assert.deepEqual(served(watch), [[V1, null], pointing(V1).pointer, V1])
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(served(watch), [[V2, V1], pointing(V2).pointer, V2])
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
  await watch.started
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual([served(watch), loads, released.length], [[[V1, null], again.pointer, V1], [V1], 1])
  watch.stop()
})

test("a version whose data fails to load, or a pointer that cannot be read, leaves the current version and its pointer in place while it is kept, is logged, and is tried again at the next read", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch, loads, logged } = scripted({
    checks: [pointing(V1), pointing(V2), { kind: "failed", reason: "current.json names no version" }, pointing(V2)],
    disk: [onDisk(V2), onDisk(V1)],
    failing: new Set([V2]),
  })
  await watch.started
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(served(watch), [[V1, null], pointing(V1).pointer, V2])
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(served(watch), [[V1, null], pointing(V1).pointer, null])
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(served(watch), [[V2, V1], pointing(V2).pointer, V2])
  assert.deepEqual(loads, [V1, V2, V2])
  assert.deepEqual(logged, [
    `release {"version":"${V1}"}`,
    `release-failed {"version":"${V2}","reason":"catalog.json: not in the data version"}`,
    'pointer-unreadable {"reason":"current.json names no version"}',
    `release {"version":"${V2}"}`,
  ])
  watch.stop()
})

test("at start, when the version the pointer names does not load, the newest kept version that loads is served, with a pointer naming it", async () => {
  const { watch, loads, logged } = scripted({ checks: [pointing(BAD)], disk: [onDisk(BAD), onDisk(V3), onDisk(V2), onDisk(V1)], broken: new Set([BAD, V3]) })
  await watch.started
  assert.deepEqual(served(watch), [[V2, null], onDisk(V2).pointer, BAD])
  assert.deepEqual(loads, [BAD, V3, V2])
  assert.deepEqual(logged.at(-1), `release-fallback {"version":"${V2}"}`)
  watch.stop()
})

test("at start, when the pointer cannot be read, the newest kept version that loads is served", async () => {
  const { watch } = scripted({ checks: [{ kind: "failed", reason: "ENOENT" }], disk: [onDisk(V2), onDisk(V1)] })
  await watch.started
  assert.deepEqual(served(watch), [[V2, null], onDisk(V2).pointer, null])
  watch.stop()
})

test("once the version served is no longer kept while the pointer names one that does not load, the newest kept version that loads replaces it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch, keep, loads, released } = scripted({ checks: [pointing(V1), pointing(BAD), pointing(BAD)], disk: [onDisk(BAD), onDisk(V1)], broken: new Set([BAD]) })
  await watch.started
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(served(watch), [[V1, null], pointing(V1).pointer, BAD])
  keep([onDisk(BAD), onDisk(V2)])
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(served(watch), [[V2, V1], onDisk(V2).pointer, BAD])
  assert.deepEqual(loads, [V1, BAD, BAD, V2])
  assert.deepEqual(released.map(versions), [
    [V1, null],
    [V2, V1],
  ])
  watch.stop()
})

test("kept versions that cannot be listed are logged and leave the service as it was", async () => {
  const { watch, keep, logged } = scripted({ checks: [pointing(BAD)], broken: new Set([BAD]) })
  keep(new Error("EACCES: permission denied"))
  await watch.started
  assert.deepEqual(served(watch), [["starting"], null, BAD])
  assert.deepEqual(logged.at(-1), 'kept-unreadable {"reason":"EACCES: permission denied"}')
  watch.stop()
})

test("a release whose follow-up fails is still served, and the failure is logged", async () => {
  const { watch, logged } = scripted({ checks: [pointing(V1)], hookFails: true })
  await watch.started
  assert.deepEqual(versions(watch.state()), [V1, null])
  assert.deepEqual(logged, [`release {"version":"${V1}"}`, `release-hook-failed {"version":"${V1}","reason":"disk full"}`])
  watch.stop()
})

test("until a version loads, from the pointer or kept, the service is starting and serves no pointer", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch } = scripted({ checks: [{ kind: "failed", reason: "ENOENT" }, pointing(V2), pointing(V1)], disk: [onDisk(V3)], failing: new Set([V2]), broken: new Set([V3]) })
  for (let read = 0; read < 2; read++) {
    await flush()
    assert.deepEqual([watch.state(), watch.pointer()], [{ kind: "starting" }, null])
    t.mock.timers.tick(EVERY_MS)
  }
  await flush()
  assert.deepEqual(served(watch), [[V1, null], pointing(V1).pointer, V1])
  watch.stop()
})

test("once stopped, between reads or during one, no further read is made", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const between = scripted({ checks: [] })
  await between.watch.started
  between.watch.stop()
  t.mock.timers.tick(EVERY_MS * 3)
  await flush()
  assert.equal(between.reads(), 1)
  const pending = Promise.withResolvers<PointerCheck>()
  const during = scripted({ checks: [pending.promise] })
  await flush()
  during.watch.stop()
  pending.resolve(pointing(V1))
  await during.watch.started
  t.mock.timers.tick(EVERY_MS * 3)
  await flush()
  assert.equal(during.reads(), 1)
})

test("a version whose drawing is unknown is adopted all the same, and its adoption logs why once however often the pointer names it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch, logged } = scripted({ checks: [pointing(V1), pointing(V1), pointing(V2)], undrawn: new Set([V1]) })
  await watch.started
  assert.deepEqual(served(watch), [[V1, null], pointing(V1).pointer, V1])
  for (let poll = 0; poll < 2; poll++) {
    t.mock.timers.tick(EVERY_MS)
    await flush()
  }
  assert.deepEqual(served(watch), [[V2, V1], pointing(V2).pointer, V2])
  assert.deepEqual(logged, [
    `release {"version":"${V1}"}`,
    `drawing-unknown {"version":"${V1}","reason":"seats/hemicycle.csv: not in the data version"}`,
    `release {"version":"${V2}"}`,
  ])
})
