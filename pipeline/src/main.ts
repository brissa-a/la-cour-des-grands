import { catalog } from "./core/catalog.ts";
import { OUTPUT_DIR } from "./core/csv.ts";
import type { Job } from "./core/job.ts";
import { publish } from "./core/publish.ts";
import { communes } from "./jobs/communes.ts";
import { hemicycle } from "./jobs/hemicycle.ts";
import { init } from "./jobs/init.ts";
import { links } from "./jobs/links.ts";
import { PHOTOS_OUTPUT_DIR, PHOTOS_REPOSITORY, photos } from "./jobs/photos.ts";
import { majorVotes, votesByBill, votesCatalog } from "./jobs/votes.ts";
import { options } from "./options.ts";

const DATA_REPOSITORY = "brissa-a/lcdg-data";

const files = [init, hemicycle, communes, links, votesCatalog, majorVotes, votesByBill];
const all = catalog(files);

const publications = options.publishTo
  ? [
      publish({ repository: PHOTOS_REPOSITORY, from: PHOTOS_OUTPUT_DIR, branch: options.publishTo.branch, after: { photos } }),
      publish({ repository: DATA_REPOSITORY, from: OUTPUT_DIR, branch: options.publishTo.branch, after: { all } }),
    ]
  : [];

const jobs: Job<unknown>[] = [photos, ...files, all, ...publications];
const target = options.job === undefined ? null : jobs.find((j) => j.name === options.job);
if (target === undefined) {
  console.error(`Unknown job: ${options.job}. Available jobs: ${jobs.map((j) => j.name).join(", ")}`);
  process.exit(1);
}
await Promise.all(target === null ? [all, ...publications].map((j) => j.result()) : [target.result()]);
if (options.publishTo === null) console.log("Local run only: nothing was pushed (use --push-to-remote --branch <name> to publish).");
