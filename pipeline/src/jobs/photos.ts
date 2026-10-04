import { access } from "node:fs/promises";
import { job } from "../core/job.ts";
import { today } from "../core/types.ts";
import { type OfficialPhoto, officialPhoto } from "../photos/officialPhoto.ts";
import { MODEL, removeBackgrounds, toWebp } from "../photos/rembg.ts";
import { loadRegistry, saveRegistry } from "../photos/registry.ts";
import { type Deputy, type DeputyId, deputies, inOffice } from "./deputies.ts";

export const PHOTOS_OUTPUT_DIR = "output/photos";
export const PHOTOS_BASE_URL = "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/v2";
const CUTOUTS_DIR = "cache/nobg/images";
const PARALLEL_DOWNLOADS = 8;
const BATCH_SIZE = 25;

type Candidate = { deputy: Deputy; photo: OfficialPhoto };

async function inBatches<T, R>(items: T[], size: number, f: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(f))));
  }
  return results;
}

const exists = (path: string) => access(path).then(
  () => true,
  () => false,
);

export const photos = job({
  name: "photos",
  dependencies: { deputies },
  async run({ deputies }): Promise<Set<DeputyId>> {
    const registry = await loadRegistry();
    const downloaded = await inBatches(deputies, PARALLEL_DOWNLOADS, async (deputy) => {
      const photo = await officialPhoto(deputy.id);
      return photo === "missing" ? [] : [{ deputy, photo }];
    });
    const candidates: Candidate[] = downloaded.flat();

    const isUpToDate = ({ deputy, photo }: Candidate) => {
      const cutout = registry.get(deputy.id);
      return cutout?.model === MODEL && cutout.originalSha256 === photo.sha256;
    };
    const todo = candidates
      .filter((c) => !isUpToDate(c))
      .sort((a, b) => Number(inOffice(b.deputy)) - Number(inOffice(a.deputy)));
    if (todo.length > 0) console.log(`  ${todo.length} photos to cut out with ${MODEL}`);

    const recut = new Set<DeputyId>();
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const produced = await removeBackgrounds(
        batch.map((c) => c.photo.path),
        CUTOUTS_DIR,
      );
      for (const { deputy, photo } of batch) {
        if (!produced.has(deputy.id)) continue;
        registry.set(deputy.id, { model: MODEL, date: today(), originalSha256: photo.sha256 });
        recut.add(deputy.id);
      }
      await saveRegistry(registry);
      console.log(`  ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
    }

    const published = candidates.filter(isUpToDate).map((c) => c.deputy.id);
    const needsWebp = await Promise.all(
      published.map(async (id) => recut.has(id) || !(await exists(`${PHOTOS_OUTPUT_DIR}/${id}.webp`))),
    );
    await toWebp(
      published.filter((_, i) => needsWebp[i]).map((id) => `${CUTOUTS_DIR}/${id}.png`),
      PHOTOS_OUTPUT_DIR,
    );
    return new Set(published);
  },
});
