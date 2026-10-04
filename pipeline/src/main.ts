import { parseArgs } from "node:util";
import { catalog } from "./core/catalog.ts";
import type { Job } from "./core/job.ts";
import { init } from "./jobs/init.ts";

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: { "push-to-remote": { type: "boolean", default: false } },
});

const files = [init];
const all = catalog(files);

const jobs: Job<unknown>[] = [...files, all];
const requested = positionals[0];
const target = requested === undefined ? all : jobs.find((j) => j.name === requested);
if (target === undefined) {
  console.error(`Unknown job: ${requested}. Available jobs: ${jobs.map((j) => j.name).join(", ")}`);
  process.exit(1);
}
if (options["push-to-remote"]) {
  console.error("--push-to-remote: publishing to GitHub is not implemented yet");
  process.exit(1);
}
await target.result();
console.log("Local run only: nothing was pushed (use --push-to-remote to publish).");
