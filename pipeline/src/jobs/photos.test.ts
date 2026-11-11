import assert from "node:assert/strict";
import { test } from "node:test";
import { photos } from "./photos.ts";
import { filesWithoutPhotos } from "./withoutPhotos.ts";

test("the run's cutouts wait for every file it publishes besides init, the one file that needs the photos", () => {
  assert.equal(photos.cutoutsAfter, filesWithoutPhotos);
});
