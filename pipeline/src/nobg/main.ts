import { today } from "../core/types.ts";
import { type Deputy, deputies, inOffice } from "../jobs/deputies.ts";
import { type OfficialPhoto, downloadOfficialPhoto } from "./officialPhoto.ts";
import { MODEL, removeBackgrounds } from "./rembg.ts";
import { loadRegistry, saveRegistry } from "./registry.ts";

const IMAGES_DIR = "cache/nobg/images";
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

const all = await deputies.result();
const registry = await loadRegistry();

const downloaded = await inBatches(all, PARALLEL_DOWNLOADS, async (deputy) => {
  const photo = await downloadOfficialPhoto(deputy.id);
  return photo === "missing" ? undefined : { deputy, photo };
});
const candidates = downloaded.filter((c): c is Candidate => c !== undefined);
console.log(`${candidates.length} official photos, ${all.length - candidates.length} missing`);

const isUpToDate = ({ deputy, photo }: Candidate) => {
  const cutout = registry.get(deputy.id);
  return cutout?.model === MODEL && cutout.originalSha256 === photo.sha256;
};
const todo = candidates
  .filter((c) => !isUpToDate(c))
  .sort((a, b) => Number(inOffice(b.deputy)) - Number(inOffice(a.deputy)));
console.log(`${todo.length} photos to process with ${MODEL}`);

for (let i = 0; i < todo.length; i += BATCH_SIZE) {
  const batch = todo.slice(i, i + BATCH_SIZE);
  await removeBackgrounds(
    batch.map((c) => c.photo.path),
    IMAGES_DIR,
  );
  for (const { deputy, photo } of batch) {
    registry.set(deputy.id, { model: MODEL, date: today(), originalSha256: photo.sha256 });
  }
  await saveRegistry(registry);
  console.log(`${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
}
