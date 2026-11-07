import assert from "node:assert/strict"
import { test } from "node:test"
import { photoUrl, snapshotPath, type PhotoUrl } from "./snapshotPath.ts"

const ROOT = "/data/v2/d14b3767011d709e9565eeab3af97ca1ad57650a/"

// @ts-expect-error the photo column of init.csv is a path in the data version, not yet an address the page can load
export const raw: PhotoUrl = "photos/PA720892.webp"

test("a path in a data version is plain ASCII names apart by slashes", () => {
  for (const text of ["catalog.json", "deputies/votes/projet-de-loi-de-finances-pour-2026.csv", "communes/addresses/2A004.csv", "photos/PA720892.webp", "seats/hemicycle.svg", "a_b/c.d.e", "-x"])
    assert.equal(snapshotPath(text), text)
})

test("a path that climbs out, starts at the root, names a hidden file, holds an empty segment or anything but plain ASCII is refused", () => {
  for (const text of [
    "",
    "/catalog.json",
    "../catalog.json",
    "votes/../../x",
    "./catalog.json",
    "..",
    ".",
    ".store/0123",
    "photos/.hidden.webp",
    "votes//votes.csv",
    "votes/",
    "%2e%2e/x",
    "votes%2fvotes.csv",
    "votes\\..\\x",
    "votes/votes.csv?x=1",
    "votes/votes.csv#x",
    "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/v2/PA720892.webp",
    "//evil.example/x.webp",
    "photos/PA 1.webp",
    "photos/Pé.webp",
    "photos/PA1.webp\n",
    "photos/PA1\u0000.webp",
  ])
    assert.equal(snapshotPath(text), null, JSON.stringify(text))
})

test("a photo is found under the root of the data version it was read from, and an empty or foreign column gives none", () => {
  assert.equal(photoUrl(ROOT, "photos/PA720892.webp"), `${ROOT}photos/PA720892.webp`)
  assert.equal(photoUrl("https://capture.invalid/data/v2/x/", "photos/PA1.webp"), "https://capture.invalid/data/v2/x/photos/PA1.webp")
  for (const column of ["", "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/v2/PA720892.webp", "/photos/PA1.webp", "../PA1.webp"]) assert.equal(photoUrl(ROOT, column), null, column)
})
