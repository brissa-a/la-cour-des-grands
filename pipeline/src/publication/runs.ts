import { makeDirectory, replaceAtomically } from "./files.ts";
import { describeRefusal } from "./guards.ts";
import { type DataRoot, layout } from "./paths.ts";
import type { CutoutReport } from "../photos/cutouts.ts";
import type { Outcome } from "./publish.ts";

// cutouts is null for a run that computed none: --publish-rejected.
export type Built = Outcome & { readonly cutouts: CutoutReport | null };

type Failed = { readonly status: "failed"; readonly error: string };

export type RunResult = Built | Failed;

export const EXIT_FAILED = 1;
export const EXIT_REJECTED = 3;
export const EXIT_LOCKED = 4;
export const EXIT_PUBLISHED_WITH_WARNING = 5;

export type ExitCode = 0 | typeof EXIT_FAILED | typeof EXIT_REJECTED | typeof EXIT_LOCKED | typeof EXIT_PUBLISHED_WITH_WARNING;

export function exitCode(result: Outcome | Failed): ExitCode {
  switch (result.status) {
    case "published":
      return result.warning === null ? 0 : EXIT_PUBLISHED_WITH_WARNING;
    case "unchanged":
      return 0;
    case "rejected":
      return EXIT_REJECTED;
    case "failed":
      return EXIT_FAILED;
  }
}

export function summary(result: RunResult, startedAt: Date, finishedAt: Date) {
  const run = { startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), status: result.status, exitCode: exitCode(result) };
  switch (result.status) {
    case "published":
      return {
        ...run,
        version: result.version,
        previousVersion: result.previous,
        forced: result.override !== null,
        counts: result.counts,
        refusals: (result.override?.refusals ?? []).map(describeRefusal),
        warning: result.warning,
        cutouts: result.cutouts,
        error: null,
      };
    case "unchanged":
      return {
        ...run,
        version: result.version,
        previousVersion: result.version,
        forced: false,
        counts: result.counts,
        refusals: [],
        warning: null,
        cutouts: result.cutouts,
        error: null,
      };
    case "rejected":
      return {
        ...run,
        version: result.version,
        previousVersion: result.previous,
        forced: false,
        counts: result.counts,
        refusals: result.refusals.map(describeRefusal),
        warning: result.warning,
        cutouts: result.cutouts,
        error: null,
      };
    case "failed":
      return { ...run, version: null, previousVersion: null, forced: false, counts: null, refusals: [], warning: null, cutouts: null, error: result.error };
  }
}

export async function recordRun(root: DataRoot, result: RunResult, startedAt: Date, finishedAt: Date): Promise<void> {
  const { runs } = layout(root);
  await makeDirectory(runs);
  await replaceAtomically(`${runs}/last.json`, JSON.stringify(summary(result, startedAt, finishedAt), null, 1) + "\n");
}
