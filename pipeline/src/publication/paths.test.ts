import assert from "node:assert/strict";
import { test } from "node:test";
import { publishedPhotoPath } from "../photos/paths.ts";
import type { Column } from "./catalog.ts";
import { dataRoot, layout, snapshotPath } from "./paths.ts";

test("a snapshot path names a file inside the snapshot", () => {
  for (const valid of ["catalog.json", "photos/PA1.webp", "deputies/values/vote_position.csv", "communes/addresses/2A004.csv", "a-b/c_d.e.f"])
    assert.equal(snapshotPath(valid), valid);
});

test("a path that leaves the snapshot, is absolute, hidden, empty or a URL is refused", () => {
  for (const invalid of [
    "",
    "/etc/passwd",
    "../current.json",
    "photos/../../x",
    "./catalog.json",
    "photos//PA1.webp",
    "photos/",
    ".store/abc",
    "photos/.hidden",
    "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/v2/PA1.webp",
    "photos\\PA1.webp",
    "photos/PA 1.webp",
  ])
    assert.throws(() => snapshotPath(invalid), /Not a path inside a snapshot/, invalid);
});

// @ts-expect-error a plain string is not a data version, so it cannot name a folder of v2/
void (() => layout(dataRoot("/data")).version("../x"));

// @ts-expect-error a plain string is not a deputy id
void (() => publishedPhotoPath("../x"));

// @ts-expect-error a column type is one the pipeline writes
void ((): Column => ({ name: "photo", type: "picture" }));
