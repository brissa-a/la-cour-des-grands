import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import type { IsoDate } from "../core/types.ts";
import type { DeputyId } from "../jobs/deputies.ts";
import { reasonOf } from "../publication/publish.ts";
import type { Attempt } from "./child.ts";
import type { OfficialPhoto } from "./officialPhoto.ts";
import type { PhotoFiles } from "./paths.ts";
import { type Failures, type Registry, loadFailures, loadRegistry, save } from "./registry.ts";

export type Candidate = { readonly id: DeputyId; readonly inOffice: boolean; readonly original: OfficialPhoto };

export type FailedCutout = { readonly id: DeputyId; readonly reason: string };

export type CutoutReport = { readonly failed: readonly FailedCutout[]; readonly waiting: number };

export type PhotoChoice = { readonly published: ReadonlyMap<DeputyId, string>; readonly cutouts: CutoutReport };

export type CutoutPlan = {
  readonly files: PhotoFiles;
  readonly model: string;
  readonly cutOut: (original: string, cutout: string) => Promise<Attempt>;
  readonly otherJobsDone: () => Promise<void>;
  readonly budgetMs: number;
  readonly clockMs: () => number;
  readonly today: IsoDate;
  readonly log: (line: string) => void;
};

export const RETRY_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;
const RUN_ENDED = "the run ended during this cutout, most likely killed for lack of memory";

async function orEmpty<T>(load: Promise<Map<DeputyId, T>>, log: (line: string) => void): Promise<Map<DeputyId, T>> {
  return load.catch((error: unknown) => {
    log(`  ${reasonOf(error)}: starting from an empty list`);
    return new Map<DeputyId, T>();
  });
}

const present = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

async function attempt(candidate: Candidate, plan: CutoutPlan): Promise<Attempt> {
  const cutout = plan.files.cutout(candidate.id);
  const partial = `${cutout}.partial`;
  const result = await plan.cutOut(candidate.original.path, partial);
  if (result.kind === "done")
    return rename(partial, cutout).then(
      () => result,
      (error: unknown): Attempt => ({ kind: "failed", reason: `no cutout written: ${reasonOf(error)}` }),
    );
  await rm(partial, { force: true });
  return result;
}

// The official photo as is, background included: what the site shows best of a photo whose cutout is missing.
async function uncut(candidate: Candidate, plan: CutoutPlan): Promise<[DeputyId, string][]> {
  const path = plan.files.uncut(candidate.id);
  try {
    await mkdir(dirname(path), { recursive: true });
    await sharp(candidate.original.path).removeAlpha().webp({ quality: 80, effort: 6 }).toFile(path);
    return [[candidate.id, path]];
  } catch (error) {
    plan.log(`  photo of ${candidate.id} left out: ${reasonOf(error)}`);
    return [];
  }
}

export async function choosePhotos(candidates: readonly Candidate[], plan: CutoutPlan): Promise<PhotoChoice> {
  const { files, model, today, log } = plan;
  const registry: Registry = await orEmpty(loadRegistry(files.registry), log);
  const failures: Failures = await orEmpty(loadFailures(files.failures), log);
  const cutouts = new Set((await Promise.all(candidates.map(async ({ id }) => ((await present(files.cutout(id))) ? [id] : [])))).flat());
  const isCurrent = ({ id, original }: Candidate) => {
    const cutout = registry.get(id);
    return cutout?.model === model && cutout.originalSha256 === original.sha256 && cutouts.has(id);
  };
  const failedLately = ({ id, original }: Candidate) => {
    const failure = failures.get(id);
    return failure?.model === model && failure.originalSha256 === original.sha256 && Date.parse(today) - Date.parse(failure.failedOn) < RETRY_AFTER_DAYS * DAY_MS;
  };
  const todo = candidates
    .filter((c) => !isCurrent(c) && !failedLately(c))
    .sort((a, b) => Number(b.inOffice) - Number(a.inOffice) || Number(failures.has(a.id)) - Number(failures.has(b.id)));

  const failed: FailedCutout[] = [];
  await mkdir(files.dir, { recursive: true });
  if (todo.length > 0) {
    log(`  ${todo.length} photos to cut out with ${model} once the other files are built, for ${plan.budgetMs / 60_000} min at most`);
    await plan.otherJobsDone();
  }
  const started = plan.clockMs();
  for (const [i, candidate] of todo.entries()) {
    if (plan.clockMs() - started >= plan.budgetMs) break;
    const { id, original } = candidate;
    // Recorded before the cutout starts: a run killed during it must not start with the same photo the next night.
    failures.set(id, { model, failedOn: today, originalSha256: original.sha256, reason: RUN_ENDED });
    await save(files.failures, failures);
    const result = await attempt(candidate, plan);
    const progress = `${i + 1}/${todo.length}`;
    if (result.kind === "done") {
      log(`  cutout of ${id} done (${progress})`);
      cutouts.add(id);
      registry.set(id, { model, date: today, originalSha256: original.sha256 });
      failures.delete(id);
      await save(files.registry, registry);
    } else {
      log(`  cutout of ${id} failed (${progress}): ${result.reason}`);
      failed.push({ id, reason: result.reason });
      failures.set(id, { model, failedOn: today, originalSha256: original.sha256, reason: result.reason });
    }
    await save(files.failures, failures);
  }

  const published = new Map(
    (await Promise.all(candidates.map(async (c): Promise<[DeputyId, string][]> => (cutouts.has(c.id) ? [[c.id, files.cutout(c.id)]] : uncut(c, plan))))).flat(),
  );
  const waiting = candidates.filter((c) => !isCurrent(c)).length - failed.length;
  if (failed.length > 0 || waiting > 0) log(`  cutouts: ${failed.length} failed, ${waiting} still waiting; their deputies keep their previous cutout, or the official photo`);
  return { published, cutouts: { failed, waiting } };
}
