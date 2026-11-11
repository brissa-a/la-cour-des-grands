import { type Job, job } from "../core/job.ts";
import type { IsoDate } from "../core/types.ts";
import { type Deputy, inOffice } from "../jobs/deputies.ts";
import type { Children } from "./child.ts";
import { cutoutPlan } from "./cutoutPlan.ts";
import { type Candidate, type PhotoChoice, choosePhotos } from "./cutouts.ts";
import { officialPhoto } from "./officialPhoto.ts";
import type { PhotoFiles } from "./paths.ts";

const PARALLEL_DOWNLOADS = 8;

export type PhotoSettings = {
  readonly deputies: Job<readonly Deputy[]>;
  readonly briaModel: Job<string>;
  readonly cutoutsAfter: readonly Job<unknown>[];
  readonly files: PhotoFiles;
  readonly fetch: (url: string) => Promise<Response>;
  readonly processes: Children;
  readonly skipNewCutouts: boolean;
  readonly today: () => IsoDate;
  readonly clockMs: () => number;
  readonly log: (line: string) => void;
  readonly warn: (line: string) => void;
};

export type PhotosJob = Job<PhotoChoice> & { readonly cutoutsAfter: readonly Job<unknown>[] };

async function inBatches<T, R>(items: readonly T[], size: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(f))));
  }
  return results;
}

export function photosJob(settings: PhotoSettings): PhotosJob {
  const { cutoutsAfter, files, skipNewCutouts, log } = settings;
  const source = { originals: files.originals, fetch: settings.fetch, warn: settings.warn };
  return {
    cutoutsAfter,
    ...job({
      name: "photos",
      dependencies: { deputies: settings.deputies, briaModel: settings.briaModel },
      async run({ deputies, briaModel }): Promise<PhotoChoice> {
        const downloaded = await inBatches(deputies, PARALLEL_DOWNLOADS, async (deputy): Promise<Candidate[]> => {
          const original = await officialPhoto(deputy.id, source);
          return original === "missing" ? [] : [{ id: deputy.id, inOffice: inOffice(deputy), original }];
        });
        if (skipNewCutouts) log("  no cutout computed (--skip-new-cutouts)");
        const plan = cutoutPlan({
          skipNewCutouts,
          modelPath: briaModel,
          files,
          processes: settings.processes,
          // The address files take 1.7 to 2 GB: a cutout on top of them would leave the kernel no choice but to kill the pipeline too.
          otherJobsDone: async () => {
            await Promise.all(cutoutsAfter.map((file) => file.result()));
          },
          today: settings.today(),
          clockMs: settings.clockMs,
          log,
        });
        return choosePhotos(downloaded.flat(), plan);
      },
    }),
  };
}
