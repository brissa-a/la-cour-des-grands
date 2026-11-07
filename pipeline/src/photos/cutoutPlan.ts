import { join } from "node:path";
import type { IsoDate } from "../core/types.ts";
import { MODEL } from "./bria.ts";
import type { Children } from "./child.ts";
import type { CutoutPlan } from "./cutouts.ts";
import type { PhotoFiles } from "./paths.ts";

export const CUTOUT_CHILD = join(import.meta.dirname, "cutoutChild.ts");
const CUTOUT_TIMEOUT_MS = 10 * 60_000;
// The cutouts of one run: past it, the photos left keep their previous cutout or the official photo until the next run.
const CUTOUT_BUDGET_MS = 30 * 60_000;

export type CutoutSettings = {
  readonly skipNewCutouts: boolean;
  readonly modelPath: string;
  readonly files: PhotoFiles;
  readonly processes: Children;
  readonly today: IsoDate;
  readonly log: (line: string) => void;
};

export function cutoutPlan({ skipNewCutouts, modelPath, files, processes, today, log }: CutoutSettings): CutoutPlan {
  const started = performance.now();
  return {
    files,
    model: MODEL,
    cutOut: (original, cutout) => processes.run({ file: process.execPath, args: [CUTOUT_CHILD, modelPath, original, cutout], timeoutMs: CUTOUT_TIMEOUT_MS }),
    budgetMs: skipNewCutouts ? 0 : CUTOUT_BUDGET_MS,
    elapsedMs: () => performance.now() - started,
    today,
    log,
  };
}
