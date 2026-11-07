import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshotPath } from "./paths.ts";

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
