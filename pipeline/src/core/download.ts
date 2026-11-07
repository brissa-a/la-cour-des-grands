import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, rename } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { type Job, job } from "./job.ts";

export function download(definition: { name: string; url: string; sha256: string }): Job<string> {
  const path = `cache/downloads/${definition.name}`;
  return job({
    name: `download ${definition.name}`,
    dependencies: {},
    async run() {
      const present = await access(path).then(
        () => true,
        () => false,
      );
      if (present) return path;
      const response = await fetch(definition.url);
      if (!response.ok || response.body === null) throw new Error(`${definition.url}: HTTP ${response.status}`);
      await mkdir("cache/downloads", { recursive: true });
      const hash = createHash("sha256");
      const partial = `${path}.partial`;
      await pipeline(
        Readable.fromWeb(response.body),
        async function* (chunks: AsyncIterable<Buffer>) {
          for await (const chunk of chunks) {
            hash.update(chunk);
            yield chunk;
          }
        },
        createWriteStream(partial),
      );
      const actual = hash.digest("hex");
      if (actual !== definition.sha256) throw new Error(`${definition.name}: sha256 ${actual}, expected ${definition.sha256}`);
      await rename(partial, path);
      return path;
    },
  });
}
