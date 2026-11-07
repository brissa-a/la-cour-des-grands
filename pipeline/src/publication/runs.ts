import { mkdir } from "node:fs/promises";
import { replaceAtomically } from "./files.ts";
import { describeRefusal } from "./guards.ts";
import { type DataRoot, layout } from "./paths.ts";
import type { Outcome } from "./publish.ts";

export type RunResult = Outcome | { readonly status: "failed"; readonly error: string };

export const EXIT_REJECTED = 3;

export function exitCode(result: RunResult): 0 | 1 | typeof EXIT_REJECTED {
  switch (result.status) {
    case "published":
    case "unchanged":
      return 0;
    case "rejected":
      return EXIT_REJECTED;
    case "failed":
      return 1;
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
        error: null,
      };
    case "unchanged":
      return { ...run, version: result.version, previousVersion: result.version, forced: false, counts: result.counts, refusals: [], error: null };
    case "rejected":
      return {
        ...run,
        version: result.version,
        previousVersion: result.previous,
        forced: false,
        counts: result.counts,
        refusals: result.refusals.map(describeRefusal),
        error: null,
      };
    case "failed":
      return { ...run, version: null, previousVersion: null, forced: false, counts: null, refusals: [], error: result.error };
  }
}

export async function recordRun(root: DataRoot, result: RunResult, startedAt: Date, finishedAt: Date): Promise<void> {
  const { runs } = layout(root);
  await mkdir(runs, { recursive: true });
  await replaceAtomically(`${runs}/last.json`, JSON.stringify(summary(result, startedAt, finishedAt), null, 1) + "\n");
}
