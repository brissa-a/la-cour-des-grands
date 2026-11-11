// Loaded through NODE_OPTIONS by main.test.ts, into the scheduled run and its pipeline: ntfy is a local server, and the pipeline takes the lock, says it started, then waits.
import { writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { NTFY_SERVER } from "./ntfy.ts";

if (process.argv[1]?.endsWith("/src/main.ts")) {
  writeFileSync(`${process.env.LCDG_DATA_ROOT ?? ""}/v2/.lock`, JSON.stringify({ pid: process.pid, host: hostname(), since: new Date().toISOString() }));
  await new Promise((written) => process.stderr.write("the pipeline started\n", written));
  writeFileSync(process.env.PIPELINE_STARTED ?? "", String(process.pid));
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid !== parent) process.exit(1);
  }, 100);
  await new Promise(() => undefined);
}

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(NTFY_SERVER)) return Promise.reject(new Error(`${url} is not ntfy`));
  return realFetch(`${process.env.LOCAL_NTFY ?? ""}${url.slice(NTFY_SERVER.length)}`, init);
};
