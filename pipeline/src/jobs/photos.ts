import { join } from "node:path";
import { job } from "../core/job.ts";
import { today } from "../core/types.ts";
import { options } from "../argv.ts";
import { MODEL, briaModel } from "../photos/bria.ts";
import { inChild } from "../photos/child.ts";
import { type Candidate, type PhotoChoice, choosePhotos } from "../photos/cutouts.ts";
import { officialPhoto } from "../photos/officialPhoto.ts";
import { PHOTO_FILES } from "../photos/paths.ts";
import { deputies, inOffice } from "./deputies.ts";

const PARALLEL_DOWNLOADS = 8;
const CUTOUT_CHILD = join(import.meta.dirname, "..", "photos", "cutoutChild.ts");
const CUTOUT_TIMEOUT_MS = 10 * 60_000;
// The cutouts of one run: past it, the photos left keep their previous cutout or the official photo until the next run.
const CUTOUT_BUDGET_MS = 30 * 60_000;

async function inBatches<T, R>(items: T[], size: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(f))));
  }
  return results;
}

export const photos = job({
  name: "photos",
  dependencies: { deputies, briaModel },
  async run({ deputies, briaModel }): Promise<PhotoChoice> {
    const downloaded = await inBatches(deputies, PARALLEL_DOWNLOADS, async (deputy): Promise<Candidate[]> => {
      const original = await officialPhoto(deputy.id);
      return original === "missing" ? [] : [{ id: deputy.id, inOffice: inOffice(deputy), original }];
    });
    const started = performance.now();
    if (options.skipNewCutouts) console.log("  no cutout computed (--skip-new-cutouts)");
    return choosePhotos(downloaded.flat(), {
      files: PHOTO_FILES,
      model: MODEL,
      cutOut: (original, cutout) => inChild({ file: process.execPath, args: [CUTOUT_CHILD, briaModel, original, cutout], timeoutMs: CUTOUT_TIMEOUT_MS }),
      budgetMs: options.skipNewCutouts ? 0 : CUTOUT_BUDGET_MS,
      elapsedMs: () => performance.now() - started,
      today: today(),
      log: (line) => console.log(line),
    });
  },
});
