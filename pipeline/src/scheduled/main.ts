import { readFile } from "node:fs/promises";
import { hostname, setPriority } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { scheduled } from "./commands.ts";

const PIPELINE = join(import.meta.dirname, "..", "..");

process.exitCode = await scheduled(process.argv.slice(2), {
  env: process.env,
  fetcher: fetch,
  sleep: (ms) => sleep(ms),
  setPriority: (priority) => setPriority(priority),
  readText: (path) => readFile(path, "utf8"),
  signals: process,
  hostname: hostname(),
  uid: process.getuid?.() ?? null,
  pipeline: { node: process.execPath, entry: join(PIPELINE, "src", "main.ts"), cwd: PIPELINE },
  echo: (chunk) => process.stderr.write(chunk),
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  now: () => new Date(),
});
