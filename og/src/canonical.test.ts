import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { drawable, imagePath, parseImagePath } from "./canonical.ts"
import { DATA, NEW as V2, SHA as V1, viewOf as view } from "./fixture.test.ts"

test("an image path names the data version and the sha256 of the canonical query, and carries that query so any image can be drawn again", () => {
  const { query } = view("?deputy=PA720892&vote=VTANR5L17V1&utm_source=x")
  assert.equal(query, "vote=VTANR5L17V1&color=vote&deputy=PA720892")
  const digest = createHash("sha256").update(query).digest("hex")
  assert.equal(imagePath(V1, query), `/og/${V1}/${digest}.jpg?${query}`)
  assert.equal(imagePath(V1, view("?clean=true").query), `/og/${V1}/${createHash("sha256").update("").digest("hex")}.jpg`)
})

test("the same view written in any order gets one image path, and another view or another data version gets another", () => {
  const paths = new Set(["?vote=VTANR5L17V1&deputy=PA720892", "?deputy=PA720892&vote=VTANR5L17V1&clean=capture", "?vote=VTANR5L17V1&deputy=PA720892&showPic=false"].map(search => imagePath(V1, view(search).query)))
  assert.equal(paths.size, 1)
  const one = imagePath(V1, view("?vote=VTANR5L17V1").query)
  assert.notEqual(one, imagePath(V1, view("?vote=VTANR5L17V242").query))
  assert.notEqual(one, imagePath(V2, view("?vote=VTANR5L17V1").query))
})

test("an image path reads back as its version and hash, and anything else under /og is not an image", () => {
  const path = imagePath(V1, view("?vote=VTANR5L17V1").query).split("?")[0] ?? ""
  const hash = path.slice(-68, -4)
  assert.deepEqual(parseImagePath(path), { version: V1, hash })
  for (const other of [
    `/og/${V1}/${hash}.png`,
    `/og/${V1}/${hash.toUpperCase()}.jpg`,
    `/og/${V1}/${hash.slice(1)}.jpg`,
    `/og/${V1}/x/${hash}.jpg`,
    `/og/${V1.toUpperCase()}/${hash}.jpg`,
    `/og/test-v2/${hash}.jpg`,
    `/og/../${V1}/${hash}.jpg`,
    `/og/${V1}/${hash}.jpg/`,
    `/og/fallback.jpg`,
    `/x${path}`,
  ])
    assert.equal(parseImagePath(other), null, other)
})

test("a view can be drawn unless it names a scrutin the data does not hold, which the scrutin's format alone lets through", () => {
  assert.equal(drawable(view("").shared, DATA), true)
  assert.equal(drawable(view("?vote=VTANR5L17V242").shared, DATA), true)
  const unknown = view("?vote=VTANR5L17V999999")
  assert.equal(unknown.query, "vote=VTANR5L17V999999&color=vote")
  assert.equal(drawable(unknown.shared, DATA), false)
})
