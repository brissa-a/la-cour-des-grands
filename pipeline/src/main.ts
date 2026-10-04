import { catalog } from "./core/catalog.ts";
import type { Job } from "./core/job.ts";
import { init } from "./jobs/init.ts";

const files = [init];
const all = catalog(files);

const jobs: Job<unknown>[] = [...files, all];
const requested = process.argv[2];
const target = requested === undefined ? all : jobs.find((j) => j.name === requested);
if (target === undefined) {
  console.error(`Unknown job: ${requested}. Available jobs: ${jobs.map((j) => j.name).join(", ")}`);
  process.exit(1);
}
await target.result();
