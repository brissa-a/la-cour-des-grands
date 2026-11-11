// Loaded through NODE_OPTIONS by main.test.ts, into the scheduled run and its pipeline: ntfy and the Anthropic API are local servers,
// and the pipeline either publishes a version over a previous one, or takes the lock, says it started, then waits.
import { mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { NTFY_SERVER } from "./ntfy.ts";

const v2 = `${process.env.LCDG_DATA_ROOT ?? ""}/v2`;

function publishOver(previous: string, version: string): never {
  const vote = (n: number, title: string) => `VTANR5L17V${n},${n},2026-11-10,${title},ordinary,adopted,no,projet de loi sur l'eau,deputies/votes/other.csv,https://example.org\n`;
  for (const [dir, votes] of [
    [previous, vote(1, "l'article 1er")],
    [version, vote(1, "l'article 1er") + vote(2, "l'article 2")],
  ] as const) {
    mkdirSync(`${v2}/${dir}/deputies/values`, { recursive: true });
    mkdirSync(`${v2}/${dir}/votes`, { recursive: true });
    writeFileSync(`${v2}/${dir}/votes/votes.csv`, `vote_id,number,date,title,kind,result,major,bill,file,url\n${votes}`);
    writeFileSync(`${v2}/${dir}/deputies/init.csv`, "deputy_id,last_name,first_name,in_office,department,constituency_number,group\n");
    writeFileSync(`${v2}/${dir}/deputies/values/group.csv`, "value,short_fr\n");
  }
  mkdirSync(`${v2}/.runs`, { recursive: true });
  const now = new Date().toISOString();
  const counts = { deputies: 0, votes: 2, newVotes: 1 };
  const run = { startedAt: now, finishedAt: now, status: "published", exitCode: 0, version, previousVersion: previous, forced: false, counts, refusals: [], warning: null, cutouts: { failed: [], waiting: 0 }, unseated: [], error: null };
  writeFileSync(`${v2}/.runs/last.json`, JSON.stringify(run));
  process.exit(0);
}

if (process.argv[1]?.endsWith("/src/main.ts")) {
  const [previous, version] = (process.env.PIPELINE_PUBLISHES_OVER ?? "").split(" ");
  if (previous !== undefined && version !== undefined) publishOver(previous, version);
  writeFileSync(`${v2}/.lock`, JSON.stringify({ pid: process.pid, host: hostname(), since: new Date().toISOString() }));
  await new Promise((written) => process.stderr.write("the pipeline started\n", written));
  writeFileSync(process.env.PIPELINE_STARTED ?? "", String(process.pid));
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid !== parent) process.exit(1);
  }, 100);
  await new Promise(() => undefined);
}

const ANTHROPIC_API = "https://api.anthropic.com";
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(NTFY_SERVER)) return realFetch(`${process.env.LOCAL_NTFY ?? ""}${url.slice(NTFY_SERVER.length)}`, init);
  if (url.startsWith(ANTHROPIC_API)) return realFetch(`${process.env.LOCAL_ANTHROPIC ?? ""}${url.slice(ANTHROPIC_API.length)}`, init);
  return Promise.reject(new Error(`${url} is neither ntfy nor the Anthropic API`));
};
