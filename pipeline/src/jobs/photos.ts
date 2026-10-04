import { access, mkdir, writeFile } from "node:fs/promises";
import { job } from "../core/job.ts";
import { today } from "../core/types.ts";
import { MODEL, backgroundRemover, briaModel } from "../photos/bria.ts";
import { options, targetBranch } from "../options.ts";
import { type OfficialPhoto, officialPhoto } from "../photos/officialPhoto.ts";
import { PHOTOS_OUTPUT_DIR, cutoutPath } from "../photos/paths.ts";
import { loadRegistry, saveRegistry } from "../photos/registry.ts";
import { type Deputy, type DeputyId, deputies, inOffice } from "./deputies.ts";

export { PHOTOS_OUTPUT_DIR };
export const PHOTOS_REPOSITORY = "brissa-a/lcdg-nobg";
export const PHOTOS_BASE_URL = `https://raw.githubusercontent.com/${PHOTOS_REPOSITORY}/${targetBranch}/v2`;
const PARALLEL_DOWNLOADS = 8;
const PROGRESS_INTERVAL = 25;

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
            access(cutoutPath(deputy.id)).then(
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

    if (todo.length > 0 && options.skipNewCutouts) {
      console.log(`  ${todo.length} photos waiting for a cutout, skipped (--skip-new-cutouts)`);
    } else if (todo.length > 0) {
      console.log(`  ${todo.length} photos to cut out with ${MODEL}`);
      const removeBackground = await backgroundRemover(briaModel);
      await mkdir(PHOTOS_OUTPUT_DIR, { recursive: true });
      for (const [i, { deputy, photo }] of todo.entries()) {
        await writeFile(cutoutPath(deputy.id), await removeBackground(photo.path));
        cutoutExists.add(deputy.id);
        registry.set(deputy.id, { model: MODEL, date: today(), originalSha256: photo.sha256 });
        await saveRegistry(registry);
        const done = i + 1;
        if (done % PROGRESS_INTERVAL === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
      }
    }

    return new Set(candidates.filter(isUpToDate).map((c) => c.deputy.id));
  },
});
