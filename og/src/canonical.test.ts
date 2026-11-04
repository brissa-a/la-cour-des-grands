import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { drawable, imageKey, imagePath, parseImagePath, renderId } from "./canonical.ts"
import { DATA, NEW as V2, RENDER, SHA as V1, viewOf as view } from "./fixture.test.ts"

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

test("an image path names the data version, the render and the sha256 of the image query, and carries that query so any image can be drawn again", () => {
  const { image } = view("?deputy=PA720892&vote=VTANR5L17V1&utm_source=x")
  assert.equal(image, "vote=VTANR5L17V1&color=vote&deputy=PA720892")
  assert.equal(imagePath(V1, RENDER, image), `/og/${V1}/${RENDER}/${sha256(image)}.jpg?${image}`)
  assert.equal(imagePath(V1, RENDER, view("?clean=true").image), `/og/${V1}/${RENDER}/${sha256("")}.jpg`)
})

test("the image leaves the photos out, which the page's query keeps", () => {
  const photos = view("?vote=VTANR5L17V1&showPic=true")
  assert.deepEqual([photos.query, photos.image], ["vote=VTANR5L17V1&color=vote&showPic=true", "vote=VTANR5L17V1&color=vote"])
  assert.equal(imagePath(V1, RENDER, photos.image), imagePath(V1, RENDER, view("?vote=VTANR5L17V1").image))
  assert.equal(photos.shared.photos, true)
})

test("the same view written in any order gets one image path, and another view, data version or render gets another", () => {
  const paths = new Set(["?vote=VTANR5L17V1&deputy=PA720892", "?deputy=PA720892&vote=VTANR5L17V1&clean=capture", "?vote=VTANR5L17V1&deputy=PA720892&showPic=false"].map(search => imagePath(V1, RENDER, view(search).image)))
  assert.equal(paths.size, 1)
  const one = imagePath(V1, RENDER, view("?vote=VTANR5L17V1").image)
  assert.notEqual(one, imagePath(V1, RENDER, view("?vote=VTANR5L17V242").image))
  assert.notEqual(one, imagePath(V2, RENDER, view("?vote=VTANR5L17V1").image))
  assert.notEqual(one, imagePath(V1, renderId("<!doctype html>", { width: 601 }), view("?vote=VTANR5L17V1").image))
})

test("the render id is 12 hex digits that change with the front's page or the capture settings, and only with them", () => {
  const page = '<script src="/assets/index-D-WQoeZA.js"></script>'
  const settings = { width: 600, height: 315, scale: 2, jpegQuality: 80 }
  assert.match(renderId(page, settings), /^[0-9a-f]{12}$/)
  assert.equal(renderId(page, { ...settings }), renderId(page, settings))
  assert.notEqual(renderId(page.replace("D-WQoeZA", "UyAtcRkB"), settings), renderId(page, settings))
  assert.notEqual(renderId(page, { ...settings, jpegQuality: 90 }), renderId(page, settings))
})

test("an image path reads back as its version, render and hash, and anything else under /og is not an image", () => {
  const path = imagePath(V1, RENDER, view("?vote=VTANR5L17V1").image).split("?")[0] ?? ""
  const hash = path.slice(-68, -4)
  assert.deepEqual(parseImagePath(path), { version: V1, render: RENDER, hash })
  for (const other of [
    `/og/${V1}/${RENDER}/${hash}.png`,
    `/og/${V1}/${RENDER}/${hash.toUpperCase()}.jpg`,
    `/og/${V1}/${RENDER}/${hash.slice(1)}.jpg`,
    `/og/${V1}/${RENDER.slice(1)}/${hash}.jpg`,
    `/og/${V1}/${RENDER.toUpperCase()}/${hash}.jpg`,
    `/og/${V1}/${hash}.jpg`,
    `/og/${V1}/${RENDER}/x/${hash}.jpg`,
    `/og/${V1.toUpperCase()}/${RENDER}/${hash}.jpg`,
    `/og/test-v2/${RENDER}/${hash}.jpg`,
    `/og/../${V1}/${RENDER}/${hash}.jpg`,
    `/og/${V1}/${RENDER}/${hash}.jpg/`,
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

export const unproven: readonly unknown[] = [
  // @ts-expect-error a version read from a URL or a disk is a DataVersion only once dataVersion has checked it
  imageKey("../x", view("").image),
  // @ts-expect-error the page's query keeps the photos, which the image never shows
  imagePath(V1, RENDER, view("?showPic=true").query),
  // @ts-expect-error a render id is only made by renderId
  imagePath(V1, "0123456789ab", view("").image),
  // @ts-expect-error an image query is only made by canonicalView
  imagePath(V1, RENDER, "vote=VTANR5L17V1"),
]
