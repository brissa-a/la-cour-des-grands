import { writeFile } from "node:fs/promises";
import { OUTPUT_DIR, type PublishedFile } from "./csv.ts";
import { type Job, job } from "./job.ts";
import { today } from "./types.ts";

export function catalog(files: Job<PublishedFile>[]): Job<void> {
  return job({
    name: "catalog.json",
    dependencies: Object.fromEntries(files.map((f) => [f.name, f])),
    async run(published) {
      const content = { generated: today(), files: Object.values(published) };
      await writeFile(`${OUTPUT_DIR}/catalog.json`, JSON.stringify(content, null, 1) + "\n");
    },
  });
}
