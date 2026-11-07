import assert from "node:assert/strict"
import { test } from "node:test"
import { dataVersion, pointedVersion, type DataVersion } from "./version.ts"

const VERSION = "d14b3767011d709e9565eeab3af97ca1ad57650a"

// @ts-expect-error a version read from a URL, a file or a pointer is a DataVersion only once dataVersion has checked it
export const unchecked: DataVersion = "../x"

test("a data version is 40 lowercase hex digits and nothing else, so it can name a folder and a URL segment", () => {
  assert.equal(dataVersion(VERSION), VERSION)
  for (const text of ["", VERSION.toUpperCase(), VERSION.slice(1), `${VERSION}0`, ` ${VERSION}`, `${VERSION}\n`, `${VERSION.slice(0, 39)}g`, "../../../../../../../../../../etc/passwd", "main"])
    assert.equal(dataVersion(text), null, JSON.stringify(text))
})

test("the pointer names the current version in its JSON, whatever else it holds", () => {
  assert.equal(pointedVersion(`{"version":"${VERSION}","publishedAt":"2026-11-07T04:00:00.000Z"}`), VERSION)
  assert.equal(pointedVersion(` {"publishedAt":"2026-11-07T04:00:00Z","version":"${VERSION}"}\n`), VERSION)
})

test("a pointer that is not JSON, not an object, or names no valid version names nothing", () => {
  for (const text of ["", `{"version":"${VERSION}"`, VERSION, `"${VERSION}"`, `["${VERSION}"]`, "null", `{"version":"${VERSION.toUpperCase()}"}`, `{"version":"${VERSION.slice(1)}"}`, '{"version":null}', '{"commit":"x"}', `{"version":["${VERSION}"]}`])
    assert.equal(pointedVersion(text), null, text)
})
