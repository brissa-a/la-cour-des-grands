import { fieldOf, list, optionalText, parseJson, record, text } from "../core/json.ts";
import { type DeputyId, deputyId } from "../jobs/deputies.ts";
import type { CutoutReport } from "../photos/cutouts.ts";
import { type DataVersion, dataVersion } from "../publication/version.ts";

export type RunCounts = { readonly deputies: number; readonly votes: number; readonly newVotes: number | null };

type Run = { readonly startedAt: Date };

export type LastRun = Run &
  (
    | {
        readonly status: "published";
        readonly version: DataVersion;
        readonly previousVersion: DataVersion | null;
        readonly forced: boolean;
        readonly counts: RunCounts;
        readonly refusals: readonly string[];
        readonly warning: string | null;
        readonly cutouts: CutoutReport | null;
        readonly unseated: readonly DeputyId[] | null;
      }
    | { readonly status: "unchanged"; readonly version: DataVersion; readonly counts: RunCounts; readonly cutouts: CutoutReport | null; readonly unseated: readonly DeputyId[] | null }
    | {
        readonly status: "rejected";
        readonly version: DataVersion;
        readonly previousVersion: DataVersion | null;
        readonly counts: RunCounts;
        readonly refusals: readonly string[];
        readonly warning: string | null;
        readonly cutouts: CutoutReport | null;
        readonly unseated: readonly DeputyId[] | null;
      }
    | { readonly status: "failed"; readonly error: string }
  );

function count(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${what} is not a count`);
  return value;
}

function instant(value: unknown, what: string): Date {
  const date = new Date(text(value, what));
  if (Number.isNaN(date.getTime())) throw new Error(`${what} is not a date`);
  return date;
}

function countsOf(value: unknown): RunCounts {
  const counts = record(value, "counts");
  return {
    deputies: count(counts.deputies, "counts.deputies"),
    votes: count(counts.votes, "counts.votes"),
    newVotes: counts.newVotes === null ? null : count(counts.newVotes, "counts.newVotes"),
  };
}

function version(value: unknown, what: string): DataVersion {
  return dataVersion(text(value, what));
}

function optionalVersion(value: unknown, what: string): DataVersion | null {
  return value === null ? null : version(value, what);
}

function cutoutsOf(value: unknown): CutoutReport | null {
  if (value === null) return null;
  const cutouts = record(value, "cutouts");
  return {
    failed: list(cutouts.failed, "cutouts.failed").map((entry, i) => {
      const failure = record(entry, `cutouts.failed[${i}]`);
      return { id: deputyId(text(failure.id, `cutouts.failed[${i}].id`)), reason: text(failure.reason, `cutouts.failed[${i}].reason`) };
    }),
    waiting: count(cutouts.waiting, "cutouts.waiting"),
  };
}

function unseatedOf(value: unknown): readonly DeputyId[] | null {
  return value === null ? null : list(value, "unseated").map((id, i) => deputyId(text(id, `unseated[${i}]`)));
}

const refusalsOf = (value: unknown): readonly string[] => list(value, "refusals").map((refusal, i) => text(refusal, `refusals[${i}]`));

// The summary .runs/last.json the pipeline writes at the end of a run (runs.ts), read back by another process.
export function lastRun(content: string): LastRun {
  const run = record(parseJson(content), "last.json");
  const startedAt = instant(run.startedAt, "startedAt");
  const status = fieldOf(run, "status");
  switch (status) {
    case "published":
      return {
        status,
        startedAt,
        version: version(run.version, "version"),
        previousVersion: optionalVersion(run.previousVersion, "previousVersion"),
        forced: run.forced === true,
        counts: countsOf(run.counts),
        refusals: refusalsOf(run.refusals),
        warning: optionalText(run.warning, "warning"),
        cutouts: cutoutsOf(run.cutouts),
        unseated: unseatedOf(run.unseated),
      };
    case "unchanged":
      return { status, startedAt, version: version(run.version, "version"), counts: countsOf(run.counts), cutouts: cutoutsOf(run.cutouts), unseated: unseatedOf(run.unseated) };
    case "rejected":
      return {
        status,
        startedAt,
        version: version(run.version, "version"),
        previousVersion: optionalVersion(run.previousVersion, "previousVersion"),
        counts: countsOf(run.counts),
        refusals: refusalsOf(run.refusals),
        warning: optionalText(run.warning, "warning"),
        cutouts: cutoutsOf(run.cutouts),
        unseated: unseatedOf(run.unseated),
      };
    case "failed":
      return { status, startedAt, error: text(run.error, "error") };
    default:
      throw new Error(`status is ${JSON.stringify(status ?? null)}`);
  }
}
