import assert from "node:assert/strict"
import { test } from "node:test"
import { keyHelp } from "./config.ts"
import { keySpans, pathLabel } from "./jsonKeys.ts"

const paths = (text: string) => keySpans(text).map(span => pathLabel(span.path))

test("keys get their full path, values are not keys", () => {
  const text = '{\n  "preview": {\n    "mode": "rest",\n    "holdMs" : 200\n  },\n  "other": { "a": "b:c" }\n}'
  assert.deepEqual(paths(text), ["preview", "preview.mode", "preview.holdMs", "other", "other.a"])
  const [, mode] = keySpans(text)
  assert.equal(mode && text.slice(mode.start, mode.end), '"mode"')
})

test("escaped quotes, arrays and one-line JSON keep paths right", () => {
  assert.deepEqual(paths('{"a\\"b": [1, {"c": 2}, {"g": 4}], "d": {"e": [], "f": 3}}'), ['a"b', 'a"b.[].c', 'a"b.[].g', "d", "d.e", "d.f"])
})

test("a key inside an array never gets the help of a real option", () => {
  const [, inner] = keySpans('{"preview": [{"holdMs": 1}]}')
  assert.equal(inner && pathLabel(inner.path), "preview.[].holdMs")
  assert.deepEqual(inner && keyHelp(inner.path), { kind: "unknown" })
  assert.equal(keyHelp(["preview", "holdMs"]).kind, "option")
})

test("broken JSON while typing still yields the keys before the break", () => {
  assert.deepEqual(paths('{ "preview": { "mode": "re'), ["preview", "preview.mode"])
  assert.deepEqual(paths('{ "preview": { "mode" "rest", "holdMs": 1 '), ["preview", "preview.holdMs"])
})
