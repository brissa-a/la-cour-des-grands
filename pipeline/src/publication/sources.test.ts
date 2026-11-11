import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import { deputyId } from "../jobs/deputies.ts";
import { snapshotPath } from "./paths.ts";
import { standard, temporaryDir, writeSnapshot } from "./snapshots.fixture.ts";
import { snapshotSources } from "./sources.ts";

test("a snapshot takes the files of the catalog and each given deputy's photo from its own file, never a stale file of the output folder", async () => {
  const output = await temporaryDir();
  await writeSnapshot(output, standard());
  await writeFile(`${output}/stale.csv`, "left by an older run\n");
  const sources = await snapshotSources(
    output,
    new Map([
      [deputyId("PA2"), "output/photos/uncut/PA2.webp"],
      [deputyId("PA1"), "output/photos/PA1.webp"],
    ]),
  );
  assert.deepEqual(
    sources,
    new Map([
      [snapshotPath("catalog.json"), `${output}/catalog.json`],
      [snapshotPath("deputies/init.csv"), `${output}/deputies/init.csv`],
      [snapshotPath("deputies/values/civility.csv"), `${output}/deputies/values/civility.csv`],
      [snapshotPath("votes/votes.csv"), `${output}/votes/votes.csv`],
      [snapshotPath("photos/PA1.webp"), "output/photos/PA1.webp"],
      [snapshotPath("photos/PA2.webp"), "output/photos/uncut/PA2.webp"],
    ]),
  );
});
