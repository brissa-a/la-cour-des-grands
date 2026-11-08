import { hostname } from "node:os";
import { catalog } from "./core/catalog.ts";
import { OUTPUT_DIR } from "./core/csv.ts";
import type { Job } from "./core/job.ts";
import { init } from "./jobs/init.ts";
import { cutoutProcesses, photos } from "./jobs/photos.ts";
import { votesCatalog } from "./jobs/votes.ts";
import { filesWithoutPhotos } from "./jobs/withoutPhotos.ts";
import { options } from "./argv.ts";
import { endOnInterrupt } from "./publication/interrupt.ts";
import { mirror } from "./publication/mirror.ts";
import { layout, snapshotPath } from "./publication/paths.ts";
import { publish, publishRejected } from "./publication/publish.ts";
import { runOnce } from "./publication/run.ts";
import type { Built } from "./publication/runs.ts";
import { snapshotSources } from "./publication/sources.ts";

const files = [init, ...filesWithoutPhotos];
const all = catalog(files);

const jobs: Job<unknown>[] = [photos, ...files, all];
const target = options.job === undefined ? null : jobs.find((j) => j.name === options.job);
if (target === undefined) {
  console.error(`Unknown job: ${options.job}. Available jobs: ${jobs.map((j) => j.name).join(", ")}`);
  process.exit(1);
}
if (target !== null) {
  endOnInterrupt(process, () => cutoutProcesses.stop());
  await target.result();
  console.log("Single job run: nothing was published.");
  process.exit(0);
}

const root = options.dataRoot;
const counted = { deputies: snapshotPath(init.name), votes: snapshotPath(votesCatalog.name) };
const now = () => new Date();

async function build(): Promise<Built> {
  if (options.publishRejected !== null) return { ...(await publishRejected(root, options.publishRejected, counted, now)), cutouts: null };
  await all.result();
  const { published, cutouts } = await photos.result();
  return { ...(await publish({ root, sources: await snapshotSources(OUTPUT_DIR, published), counted, now })), cutouts };
}

process.exit(
  await runOnce({
    root,
    owner: { pid: process.pid, host: hostname() },
    build,
    mirror: options.pushToRemote ? (version) => mirror(layout(root).version(version), version) : null,
    now,
    whileLocked: (lock) =>
      endOnInterrupt(process, () => {
        cutoutProcesses.stop();
        lock.release();
      }),
    console,
  }),
);
