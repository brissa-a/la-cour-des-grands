import { stat } from "node:fs/promises";
import { describeRefusal } from "./guards.ts";
import { type Lock, type LockOwner, acquireLock } from "./lock.ts";
import type { DataRoot } from "./paths.ts";
import { type Outcome, reasonOf } from "./publish.ts";
import { EXIT_FAILED, EXIT_LOCKED, type ExitCode, type RunResult, exitCode, recordRun } from "./runs.ts";
import type { DataVersion } from "./version.ts";

export type Log = { readonly log: (line: string) => void; readonly error: (message: unknown) => void };

export type RunPlan = {
  readonly root: DataRoot;
  readonly owner: LockOwner;
  readonly build: () => Promise<Outcome>;
  readonly mirror: ((version: DataVersion) => Promise<void>) | null;
  readonly now: () => Date;
  readonly whileLocked: (lock: Lock) => void;
  readonly console: Log;
};

export function report(result: RunResult): string {
  switch (result.status) {
    case "published": {
      const forced = result.override === null ? "" : ", forced over its refusals";
      const counts = `${result.counts.deputies} deputies, ${result.counts.votes} votes, ${result.counts.newVotes ?? "no previous version, so no"} new votes`;
      return `Published ${result.version}${forced} (${counts})${result.warning === null ? "" : `\nWarning: ${result.warning}`}`;
    }
    case "unchanged":
      return `Unchanged: ${result.version} is already the current version`;
    case "rejected":
      return [
        `Rejected ${result.version}, kept for inspection, current version untouched:`,
        ...result.refusals.map((r) => `  - ${describeRefusal(r)}`),
        ...(result.warning === null ? [] : [`Warning: ${result.warning}`]),
      ].join("\n");
    case "failed":
      return `Failed: ${result.error}`;
  }
}

const isDirectory = (path: string): Promise<boolean> =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

export async function runOnce(plan: RunPlan): Promise<ExitCode> {
  const { root, console } = plan;
  if (!(await isDirectory(root))) {
    console.error(`The data root ${root} is not a directory: create it, or pass --data-root or LCDG_DATA_ROOT.`);
    return EXIT_FAILED;
  }
  const locking = await acquireLock(root, plan.owner, plan.now());
  if (locking.kind === "held") {
    console.error(`Another run holds ${locking.path} (${locking.holder}). If no run is in progress, delete that file.`);
    return EXIT_LOCKED;
  }
  plan.whileLocked(locking.lock);
  try {
    const startedAt = plan.now();
    const result = await plan.build().catch((error: unknown): RunResult => {
      console.error(error);
      return { status: "failed", error: reasonOf(error) };
    });
    await recordRun(root, result, startedAt, plan.now());
    console.log(report(result));
    const code = exitCode(result);
    if (plan.mirror === null || (result.status !== "published" && result.status !== "unchanged")) return code;
    try {
      await plan.mirror(result.version);
      return code;
    } catch (error) {
      console.error(error);
      console.error(`The mirror failed; the run itself is recorded as ${result.status}.`);
      return EXIT_FAILED;
    }
  } finally {
    locking.lock.release();
  }
}
