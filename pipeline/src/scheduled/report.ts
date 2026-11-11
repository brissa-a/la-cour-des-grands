import { EXIT_LOCKED, EXIT_PUBLISHED_WITH_WARNING, EXIT_REJECTED } from "../publication/runs.ts";
import type { DeputyId } from "../jobs/deputies.ts";
import type { CutoutReport } from "../photos/cutouts.ts";
import type { DataVersion } from "../publication/version.ts";
import type { LastRun, RunCounts } from "./lastRun.ts";
import type { Notification } from "./ntfy.ts";

export type Exit =
  | { readonly kind: "code"; readonly code: number }
  | { readonly kind: "signal"; readonly signal: NodeJS.Signals }
  | { readonly kind: "unstarted"; readonly reason: string };

export type RunRecord = { readonly kind: "fresh"; readonly run: LastRun } | { readonly kind: "none"; readonly reason: string };

export type Observed = {
  readonly exit: Exit;
  readonly record: RunRecord;
  readonly lockPath: string;
  readonly holder: string | null;
  readonly lockReleased: boolean;
  readonly outOfMemory: boolean;
  readonly stderr: string;
};

export const IN_CONTAINER = "docker --context abysshopper exec lcdg-lcdg-pipeline-1";

const MAX_STDERR_LINES = 12;
const MAX_STDERR_BYTES = 1500;

export function tail(output: string, maxLines = MAX_STDERR_LINES, maxBytes = MAX_STDERR_BYTES): string {
  const lines = output.trimEnd().split("\n").slice(-maxLines);
  while (lines.length > 1 && Buffer.byteLength(lines.join("\n")) > maxBytes) lines.shift();
  const last = lines.join("\n");
  return Buffer.byteLength(last) > maxBytes ? Buffer.from(last).subarray(-maxBytes).toString("utf8").replace(/^�+/u, "") : last;
}

const figures = ({ deputies, votes }: RunCounts) => `${deputies} deputies, ${votes} votes`;

const MAX_LISTED_CUTOUTS = 5;
const MAX_LISTED_UNSEATED = 10;

function cutoutLines(cutouts: CutoutReport | null): string[] {
  if (cutouts === null || (cutouts.failed.length === 0 && cutouts.waiting === 0)) return [];
  const { failed, waiting } = cutouts;
  return [
    `Cutouts: ${failed.length} failed, ${waiting} still waiting. Until theirs is done, these deputies keep their previous cutout, or the official photo.`,
    ...failed.slice(0, MAX_LISTED_CUTOUTS).map(({ id, reason }) => `- ${id}: ${reason}`),
    ...(failed.length > MAX_LISTED_CUTOUTS ? [`- and ${failed.length - MAX_LISTED_CUTOUTS} more, listed in .runs/last.json`] : []),
  ];
}

function unseatedLines(unseated: readonly DeputyId[] | null): string[] {
  if (unseated === null || unseated.length === 0) return [];
  const listed = unseated.slice(0, MAX_LISTED_UNSEATED).join(", ");
  const more = unseated.length > MAX_LISTED_UNSEATED ? ` and ${unseated.length - MAX_LISTED_UNSEATED} more, listed in .runs/last.json` : "";
  return [`In office without a seat, so out of the hemicycle until the Assemblée gives them one: ${listed}${more}.`];
}

function done(run: LastRun & { readonly status: "published" | "unchanged" }): Notification {
  const failedCutouts = run.cutouts?.failed.length ?? 0;
  const unseated = run.unseated?.length ?? 0;
  const published = run.status === "published";
  const pruned = !published || run.warning === null;
  const titled = [
    published ? (run.counts.newVotes === null ? "Data published" : `Data published: ${run.counts.newVotes} new votes`) : "Data unchanged",
    ...(pruned ? [] : ["old versions not pruned"]),
    ...(failedCutouts === 0 ? [] : [`cutouts failed: ${failedCutouts}`]),
    ...(unseated === 0 ? [] : [`without a seat: ${unseated}`]),
  ];
  const lines = published
    ? [
        `Version ${run.version} (${figures(run.counts)}).`,
        run.previousVersion === null ? "First version of the data root." : `Previous version ${run.previousVersion}.`,
        ...(run.forced ? ["Forced over the guards' refusals:", ...run.refusals.map((r) => `- ${r}`)] : []),
        ...(run.warning === null ? [] : [`Warning: ${run.warning}`]),
      ]
    : [`${run.version} is still the current version (${figures(run.counts)}).`];
  const quiet = pruned && failedCutouts === 0 && unseated === 0;
  return {
    topic: "done",
    priority: quiet ? 2 : 3,
    title: titled.join(", "),
    body: [...lines, ...unseatedLines(run.unseated), ...cutoutLines(run.cutouts)].join("\n"),
    tags: [quiet ? "white_check_mark" : "warning"],
  };
}

function rejected(run: LastRun & { readonly status: "rejected" }): Notification {
  return {
    topic: "rejected",
    priority: 4,
    title: "Data rejected by the guards",
    body: [
      `Candidate ${run.version} (${figures(run.counts)}) was set aside, ${run.previousVersion ?? "no version"} stays current:`,
      ...run.refusals.map((r) => `- ${r}`),
      ...(run.warning === null ? [] : [`Warning: ${run.warning}`]),
      ...unseatedLines(run.unseated),
      ...cutoutLines(run.cutouts),
      `Once inspected, publish it with: ${IN_CONTAINER} node src/scheduled/main.ts run --publish-rejected ${run.version}`,
    ].join("\n"),
    tags: ["no_entry"],
  };
}

function locked({ holder, lockPath }: Observed): Notification {
  return {
    topic: "locked",
    priority: 3,
    title: "Run skipped: another run holds the lock",
    body: [`${lockPath}: ${holder ?? "unreadable"}.`, `If no run is in progress: ${IN_CONTAINER} rm ${lockPath}`].join("\n"),
    tags: ["lock"],
  };
}

function ending(exit: Exit, outOfMemory: boolean): { readonly title: string; readonly line: string } {
  switch (exit.kind) {
    case "code":
      return { title: `Run failed (exit ${exit.code})`, line: `The pipeline exited with ${exit.code}.` };
    case "signal":
      return outOfMemory
        ? { title: "Run killed: out of memory", line: `The kernel killed the pipeline (${exit.signal}): the container reached its memory limit.` }
        : { title: `Run killed by ${exit.signal}`, line: `The pipeline was killed by ${exit.signal}.` };
    case "unstarted":
      return { title: "Run not started", line: `The pipeline could not start: ${exit.reason}` };
  }
}

function recorded(record: RunRecord): string {
  if (record.kind === "none") return `It recorded no run: ${record.reason}.`;
  const { run } = record;
  return run.status === "failed" ? `It recorded: ${run.error}` : `It recorded the run as ${run.status} (${run.version}).`;
}

function failed({ exit, record, outOfMemory, lockReleased, lockPath, stderr }: Observed): Notification {
  const { title, line } = ending(exit, outOfMemory);
  const errors = tail(stderr);
  return {
    topic: "failed",
    priority: 4,
    title,
    body: [
      line,
      recorded(record),
      ...(lockReleased ? [`Its lock ${lockPath}, held by no process any more, was released: the next run will start.`] : []),
      ...(errors === "" ? [] : ["Last lines of its error output:", errors]),
    ].join("\n"),
    tags: ["rotating_light"],
  };
}

const succeeded = (exit: Exit): boolean => exit.kind === "code" && (exit.code === 0 || exit.code === EXIT_PUBLISHED_WITH_WARNING);

export function notificationFor(observed: Observed): Notification {
  const { exit, record } = observed;
  if (exit.kind !== "code") return failed(observed);
  if (exit.code === EXIT_LOCKED) return locked(observed);
  if (record.kind !== "fresh") return failed(observed);
  const { run } = record;
  if ((run.status === "published" || run.status === "unchanged") && succeeded(exit)) return done(run);
  if (run.status === "rejected" && exit.code === EXIT_REJECTED) return rejected(run);
  return failed(observed);
}

export type Replacement = { readonly version: DataVersion; readonly previous: DataVersion };

// The versions to compare for the news: only a run reported done that published over an earlier version has any.
export function replacementOf({ exit, record }: Observed): Replacement | null {
  if (!succeeded(exit) || record.kind !== "fresh") return null;
  const { run } = record;
  return run.status === "published" && run.previousVersion !== null ? { version: run.version, previous: run.previousVersion } : null;
}
