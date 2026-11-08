import { job } from "../core/job.ts";
import { today } from "../core/types.ts";
import { options } from "../argv.ts";
import { briaModel } from "../photos/bria.ts";
import { children } from "../photos/child.ts";
import { cutoutPlan } from "../photos/cutoutPlan.ts";
import { type Candidate, type PhotoChoice, choosePhotos } from "../photos/cutouts.ts";
import { officialPhoto } from "../photos/officialPhoto.ts";
import { PHOTO_FILES } from "../photos/paths.ts";
import { deputies, inOffice } from "./deputies.ts";
import { filesWithoutPhotos } from "./withoutPhotos.ts";

const PARALLEL_DOWNLOADS = 8;

export const cutoutProcesses = children();

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
    const source = { originals: PHOTO_FILES.originals, fetch: (url: string) => fetch(url), warn: (line: string) => console.warn(line) };
    const downloaded = await inBatches(deputies, PARALLEL_DOWNLOADS, async (deputy): Promise<Candidate[]> => {
      const original = await officialPhoto(deputy.id, source);
      return original === "missing" ? [] : [{ id: deputy.id, inOffice: inOffice(deputy), original }];
    });
    if (options.skipNewCutouts) console.log("  no cutout computed (--skip-new-cutouts)");
    const plan = cutoutPlan({
      skipNewCutouts: options.skipNewCutouts,
      modelPath: briaModel,
      files: PHOTO_FILES,
      processes: cutoutProcesses,
      // The address files take 1.7 to 2 GB: a cutout on top of them would leave the kernel no choice but to kill the pipeline too.
      otherJobsDone: async () => {
        await Promise.all(filesWithoutPhotos.map((file) => file.result()));
      },
      today: today(),
      clockMs: () => performance.now(),
      log: (line) => console.log(line),
    });
    return choosePhotos(downloaded.flat(), plan);
  },
});
