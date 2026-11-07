import { stat } from "node:fs/promises";
import { catalog } from "./core/catalog.ts";
import { OUTPUT_DIR } from "./core/csv.ts";
import type { Job } from "./core/job.ts";
import { communeConstituencyTable, constituencyContours, electoralRollFiles } from "./jobs/address/published.ts";
import { communes } from "./jobs/communes.ts";
import { hemicycle } from "./jobs/hemicycle.ts";
import { init } from "./jobs/init.ts";
import { links } from "./jobs/links.ts";
import { photos } from "./jobs/photos.ts";
import { majorVotes, votesByBill, votesCatalog } from "./jobs/votes.ts";
import { options } from "./options.ts";
import { describeRefusal } from "./publication/guards.ts";
import { mirror } from "./publication/mirror.ts";
import { layout, snapshotPath } from "./publication/paths.ts";
import { type Outcome, publish, publishRejected } from "./publication/publish.ts";
import { type RunResult, exitCode, recordRun } from "./publication/runs.ts";
import { snapshotSources } from "./publication/sources.ts";

const files = [
  init,
  hemicycle,
  communes,
  links,
  votesCatalog,
  majorVotes,
  votesByBill,
  communeConstituencyTable,
  constituencyContours,
  electoralRollFiles,
];
const all = catalog(files);

const jobs: Job<unknown>[] = [photos, ...files, all];
const target = options.job === undefined ? null : jobs.find((j) => j.name === options.job);
if (target === undefined) {
  console.error(`Unknown job: ${options.job}. Available jobs: ${jobs.map((j) => j.name).join(", ")}`);
  process.exit(1);
}
if (target !== null) {
  await target.result();
  console.log("Single job run: nothing was published.");
  process.exit(0);
}

const root = options.dataRoot;
if (!(await stat(root).then((s) => s.isDirectory(), () => false))) {
  console.error(`The data root ${root} is not a directory: create it, or pass --data-root or LCDG_DATA_ROOT.`);
  process.exit(1);
}

const counted = { deputies: snapshotPath(init.name), votes: snapshotPath(votesCatalog.name) };
const now = () => new Date();

async function run(): Promise<Outcome> {
  if (options.publishRejected !== null) return publishRejected(root, options.publishRejected, counted, now);
  await all.result();
  return publish({ root, sources: await snapshotSources(OUTPUT_DIR, await photos.result()), counted, now });
}

function report(result: RunResult): string {
  switch (result.status) {
    case "published":
      return `Published ${result.version}${result.override === null ? "" : ", forced over its refusals"} (${result.counts.deputies} deputies, ${result.counts.votes} votes, ${result.counts.newVotes ?? "no previous version, so no"} new votes)`;
    case "unchanged":
      return `Unchanged: ${result.version} is already the current version`;
    case "rejected":
      return [`Rejected ${result.version}, kept for inspection, current version untouched:`, ...result.refusals.map((r) => `  - ${describeRefusal(r)}`)].join("\n");
    case "failed":
      return `Failed: ${result.error}`;
  }
}

const startedAt = now();
const result = await run().catch((error: unknown): RunResult => {
  console.error(error);
  return { status: "failed", error: error instanceof Error ? error.message : String(error) };
});
await recordRun(root, result, startedAt, now());
console.log(report(result));
if (options.pushToRemote && (result.status === "published" || result.status === "unchanged")) {
  await mirror(layout(root).version(result.version), result.version);
}
process.exit(exitCode(result));
