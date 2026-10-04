import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { job } from "../core/job.ts";
import { today } from "../core/types.ts";
import { MODEL, backgroundRemover, briaModel } from "../photos/bria.ts";
import { type OfficialPhoto, officialPhoto } from "../photos/officialPhoto.ts";
import { loadRegistry, saveRegistry } from "../photos/registry.ts";
import { type Deputy, type DeputyId, deputies, inOffice } from "./deputies.ts";

export const PHOTOS_OUTPUT_DIR = "output/photos";
export const PHOTOS_BASE_URL = "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/v2";
const CUTOUTS_DIR = "cache/nobg/cutouts";
const PARALLEL_DOWNLOADS = 8;
const REGISTRY_SAVE_INTERVAL = 25;

type Candidate = { deputy: Deputy; photo: OfficialPhoto };

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
  async run({ deputies, briaModel }): Promise<Set<DeputyId>> {
    const registry = await loadRegistry();
    const downloaded = await inBatches(deputies, PARALLEL_DOWNLOADS, async (deputy) => {
      const photo = await officialPhoto(deputy.id);
      return photo === "missing" ? [] : [{ deputy, photo }];
    });
    const candidates: Candidate[] = downloaded.flat();

    const cutoutExists = new Set(
      (
        await Promise.all(
          candidates.map(({ deputy }) =>
            access(`${CUTOUTS_DIR}/${deputy.id}.webp`).then(
              () => [deputy.id],
              () => [],
            ),
          ),
        )
      ).flat(),
    );
    const isUpToDate = ({ deputy, photo }: Candidate) => {
      const cutout = registry.get(deputy.id);
      return cutout?.model === MODEL && cutout.originalSha256 === photo.sha256 && cutoutExists.has(deputy.id);
    };
    const todo = candidates
      .filter((c) => !isUpToDate(c))
      .sort((a, b) => Number(inOffice(b.deputy)) - Number(inOffice(a.deputy)));

    if (todo.length > 0) {
      console.log(`  ${todo.length} photos to cut out with ${MODEL}`);
      const removeBackground = await backgroundRemover(briaModel);
      await mkdir(CUTOUTS_DIR, { recursive: true });
      for (const [i, { deputy, photo }] of todo.entries()) {
        await writeFile(`${CUTOUTS_DIR}/${deputy.id}.webp`, await removeBackground(photo.path));
        cutoutExists.add(deputy.id);
        registry.set(deputy.id, { model: MODEL, date: today(), originalSha256: photo.sha256 });
        const done = i + 1;
        if (done % REGISTRY_SAVE_INTERVAL === 0 || done === todo.length) {
          await saveRegistry(registry);
          console.log(`  ${done}/${todo.length}`);
        }
      }
    }

    const published = candidates.filter(isUpToDate).map((c) => c.deputy.id);
    await mkdir(PHOTOS_OUTPUT_DIR, { recursive: true });
    await Promise.all(published.map((id) => copyFile(`${CUTOUTS_DIR}/${id}.webp`, `${PHOTOS_OUTPUT_DIR}/${id}.webp`)));
    return new Set(published);
  },
});
