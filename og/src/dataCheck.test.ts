import assert from "node:assert/strict"
import { test } from "node:test"
import { dataCheck } from "./dataCheck.ts"
import { DATA, NEW, OLD } from "./fixture.test.ts"
import type { Releases } from "./releases.ts"

const serving = (version: typeof OLD): Releases => ({ kind: "ready", current: { version, data: DATA }, previous: null })

test("a data root is checked as serving the version current.json names, an older one, or nothing", () => {
  assert.deepEqual(dataCheck(serving(NEW), NEW), { kind: "pointed", version: NEW })
  assert.deepEqual(dataCheck(serving(OLD), NEW), { kind: "older", version: OLD, pointed: NEW })
  assert.deepEqual(dataCheck(serving(OLD), null), { kind: "older", version: OLD, pointed: null })
  assert.deepEqual(dataCheck({ kind: "starting" }, NEW), { kind: "none" })
  assert.deepEqual(dataCheck({ kind: "starting" }, null), { kind: "none" })
})
