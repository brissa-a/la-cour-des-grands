import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { type Job, job } from "./job.ts";

export function source(definition: { name: string; url: string; maxAgeHours: number }): Job<Uint8Array> {
  const path = `cache/sources/${definition.name}`;
  return job({
    name: `source ${definition.name}`,
    dependencies: {},
    async run() {
      const age = await stat(path).then(
        (s) => Date.now() - s.mtimeMs,
        () => Infinity,
      );
      if (age < definition.maxAgeHours * 3600_000) return new Uint8Array(await readFile(path));
      const response = await fetch(definition.url);
      if (!response.ok) throw new Error(`${definition.url}: HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      await mkdir("cache/sources", { recursive: true });
      await writeFile(path, bytes);
      return bytes;
    },
  });
}
