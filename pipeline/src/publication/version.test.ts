import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshotPath } from "./paths.ts";
import { type ManifestLine, dataVersion, sha256Of, versionOf } from "./version.ts";

const bytes = (text: string) => new TextEncoder().encode(text);
const line = (path: string, content: string): ManifestLine => ({ path: snapshotPath(path), sha256: sha256Of(bytes(content)) });

const snapshot = [line("votes/votes.csv", "x\n"), line("photos/PA1.webp", "y"), line("catalog.json", "{}\n")];

test("the version is the SHA-1 of the sha256sum manifest sorted by path, as the shell computes it", () => {
  // find . -type f | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done | shasum -a 1
  assert.equal(versionOf(snapshot), "6a64dfbf2449e4c8357bc0319b9fe0b747c577d9");
});

test("the version does not depend on the order the files were staged in", () => {
  const [votes, photo, catalog] = snapshot;
  if (votes === undefined || photo === undefined || catalog === undefined) throw new Error("fixture changed");
  for (const order of [
    [votes, photo, catalog],
    [votes, catalog, photo],
    [photo, votes, catalog],
    [photo, catalog, votes],
    [catalog, votes, photo],
    [catalog, photo, votes],
  ])
    assert.equal(versionOf(order), "6a64dfbf2449e4c8357bc0319b9fe0b747c577d9");
});

test("one changed byte, one renamed file or one more file changes the version", () => {
  const original = versionOf(snapshot);
  assert.notEqual(versionOf([line("votes/votes.csv", "z\n"), ...snapshot.slice(1)]), original);
  assert.notEqual(versionOf([line("votes/all.csv", "x\n"), ...snapshot.slice(1)]), original);
  assert.notEqual(versionOf([...snapshot, line("photos/PA2.webp", "y")]), original);
});

test("a data version is exactly 40 lowercase hex digits", () => {
  assert.equal(dataVersion("6a64dfbf2449e4c8357bc0319b9fe0b747c577d9"), "6a64dfbf2449e4c8357bc0319b9fe0b747c577d9");
  for (const invalid of ["6A64DFBF2449E4C8357BC0319B9FE0B747C577D9", "6a64dfbf2449e4c8357bc0319b9fe0b747c577d", "6a64dfbf2449e4c8357bc0319b9fe0b747c577d9a", "g".repeat(40), ""])
    assert.throws(() => dataVersion(invalid), /data version/);
});
