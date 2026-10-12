import assert from "node:assert/strict"
import { test } from "node:test"
import type { ShareData } from "../../web/src/share/data.ts"
import { DATA, NEW as V2, OLD as V1 } from "./fixture.test.ts"
import { watchReleases, type Ready, type Releases } from "./releases.ts"
import type { DataVersion, VersionCheck } from "./version.ts"

const EVERY_MS = 300_000

const flush = async () => {
  for (let round = 0; round < 5; round++) await new Promise(resolve => setImmediate(resolve))
}

function versions(state: Releases): readonly (string | null)[] {
  if (state.kind === "starting") return ["starting"]
  return [state.current.version, state.previous === null ? null : state.previous.version]
}

type Script = { readonly checks: readonly (VersionCheck | Promise<VersionCheck>)[]; readonly failing?: Set<DataVersion>; readonly saved?: DataVersion; readonly hookFails?: boolean }

function scripted({ checks, failing = new Set(), saved, hookFails = false }: Script) {
  const etags: (string | null)[] = []
  const loads: DataVersion[] = []
  const released: Ready[] = []
  const logged: string[] = []
  const queue = [...checks]
  const watch = watchReleases({
    check: etag => {
      etags.push(etag)
      return Promise.resolve(queue.shift() ?? { kind: "unchanged" })
    },
    load: (version): Promise<ShareData> => {
      loads.push(version)
      if (failing.delete(version)) return Promise.reject(new Error("catalog.json: HTTP 500"))
      return Promise.resolve(DATA)
    },
    saved: saved ?? null,
    onRelease: ready => {
      released.push(ready)
      return hookFails ? Promise.reject(new Error("disk full")) : Promise.resolve()
    },
    log: (event, fields) => logged.push(`${event} ${JSON.stringify(fields)}`),
    everyMs: EVERY_MS,
  })
  return { watch, etags, loads, released, logged }
}

test("the version saved by the last run serves pages before GitHub answers, and a new branch head is loaded, then switched in with the old one kept", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const first = Promise.withResolvers<VersionCheck>()
  const { watch, etags, loads, released, logged } = scripted({ checks: [first.promise, { kind: "found", version: V2, etag: '"v2"' }], saved: V1 })
  await flush()
  assert.deepEqual(versions(watch.state()), [V1, null])
  first.resolve({ kind: "found", version: V1, etag: '"v1"' })
  await flush()
  assert.deepEqual(loads, [V1])
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(versions(watch.state()), [V2, V1])
  assert.deepEqual(loads, [V1, V2])
  assert.deepEqual(released.map(versions), [
    [V1, null],
    [V2, V1],
  ])
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(etags, [null, '"v1"', '"v2"'])
  assert.deepEqual(logged, [`release {"version":"${V1}"}`, `release {"version":"${V2}"}`])
  watch.stop()
})

test("a version whose data fails to load leaves the current one in place, is logged, and is tried again at the next check", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch, etags, loads, logged } = scripted({
    checks: [
      { kind: "found", version: V1, etag: '"v1"' },
      { kind: "found", version: V2, etag: '"v2"' },
      { kind: "failed", reason: "HTTP 403" },
      { kind: "unchanged" },
      { kind: "found", version: V2, etag: '"v2"' },
    ],
    failing: new Set([V2]),
  })
  await flush()
  assert.deepEqual(versions(watch.state()), [V1, null])
  for (let check = 0; check < 3; check++) {
    t.mock.timers.tick(EVERY_MS)
    await flush()
    assert.deepEqual(versions(watch.state()), [V1, null])
  }
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(versions(watch.state()), [V2, V1])
  assert.deepEqual(loads, [V1, V2, V2])
  assert.deepEqual(etags, [null, '"v1"', '"v1"', '"v1"', '"v1"'])
  assert.deepEqual(logged, [
    `release {"version":"${V1}"}`,
    `release-failed {"version":"${V2}","reason":"catalog.json: HTTP 500"}`,
    'version-check-failed {"reason":"HTTP 403"}',
    `release {"version":"${V2}"}`,
  ])
  watch.stop()
})

test("a release whose follow-up fails is still served, and the failure is logged", async () => {
  const { watch, logged } = scripted({ checks: [{ kind: "found", version: V1, etag: null }], hookFails: true })
  await flush()
  assert.deepEqual(versions(watch.state()), [V1, null])
  assert.deepEqual(logged, [`release {"version":"${V1}"}`, `release-hook-failed {"version":"${V1}","reason":"disk full"}`])
  watch.stop()
})

test("without a saved version the service is starting until GitHub names one", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const { watch } = scripted({ checks: [{ kind: "failed", reason: "HTTP 403" }, { kind: "found", version: V1, etag: null }] })
  await flush()
  assert.deepEqual(watch.state(), { kind: "starting" })
  t.mock.timers.tick(EVERY_MS)
  await flush()
  assert.deepEqual(versions(watch.state()), [V1, null])
  watch.stop()
})

test("once stopped, between checks or during one, no further check is made", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const between = scripted({ checks: [] })
  await flush()
  between.watch.stop()
  t.mock.timers.tick(EVERY_MS * 3)
  await flush()
  assert.equal(between.etags.length, 1)
  const pending = Promise.withResolvers<VersionCheck>()
  const during = scripted({ checks: [pending.promise] })
  await flush()
  during.watch.stop()
  pending.resolve({ kind: "unchanged" })
  await flush()
  t.mock.timers.tick(EVERY_MS * 3)
  await flush()
  assert.equal(during.etags.length, 1)
})
