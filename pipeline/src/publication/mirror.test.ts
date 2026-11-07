import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { type Git, mirror, runGit, siteServesItsOwnData } from "./mirror.ts";
import { temporaryDir } from "./snapshots.fixture.ts";
import { dataVersion } from "./version.ts";

const answering = (body: string, status = 200) => {
  const asked: string[] = [];
  return {
    asked,
    fetcher: (url: string) => {
      asked.push(url);
      return Promise.resolve(new Response(body, { status }));
    },
  };
};

const VERSION = dataVersion("6a64dfbf2449e4c8357bc0319b9fe0b747c577d9");
const POINTER = `{"version":"${VERSION}","publishedAt":"2026-11-07T04:00:00.000Z"}\n`;

test("the site serves its own data once its /data/v2/current.json names a version", async () => {
  const site = answering(POINTER);
  assert.equal(await siteServesItsOwnData(site.fetcher), true);
  assert.deepEqual(site.asked, ["https://cour-des-grands.fr/data/v2/current.json"]);
});

test("a site that answers its data pointer with an error, a page or a pointer naming no version still reads the mirror", async () => {
  for (const [body, status] of [
    ["Page introuvable", 404],
    ["<!doctype html><title>La cour des grands</title>", 200],
    ['{"version":"6a64dfb","publishedAt":"2026-11-07T04:00:00.000Z"}', 200],
    [POINTER, 503],
  ] as const)
    assert.equal(await siteServesItsOwnData(answering(body, status).fetcher), false, `${status} ${body}`);
});

const recordingGit = (changed: boolean) => {
  const calls: string[][] = [];
  const git: Git = (args) => {
    calls.push([...args]);
    const isDiff = args.includes("diff");
    return isDiff && changed ? Promise.reject(new Error("exit 1")) : Promise.resolve();
  };
  return { calls, git };
};

async function checkoutHolding(file: string, withGit: boolean): Promise<string> {
  const checkout = await temporaryDir();
  await mkdir(`${checkout}/v2`);
  await writeFile(`${checkout}/v2/${file}`, "previous\n");
  if (withGit) await mkdir(`${checkout}/.git`);
  return checkout;
}

async function snapshot(): Promise<string> {
  const dir = await temporaryDir();
  await writeFile(`${dir}/current.json`, POINTER);
  await mkdir(`${dir}/${VERSION}`);
  await writeFile(`${dir}/${VERSION}/init.csv`, "id\nPA1\n");
  return dir;
}

test("a site still reading the mirror makes the mirror refuse before any git command or change to its checkout", async () => {
  const { calls, git } = recordingGit(true);
  const checkout = await checkoutHolding("current.json", true);
  await assert.rejects(mirror(await snapshot(), VERSION, { fetcher: answering("Page introuvable", 404).fetcher, git, checkout }), /names no data version/);
  assert.deepEqual(calls, []);
  assert.deepEqual(await readdir(`${checkout}/v2`), ["current.json"]);
  assert.equal(await readFile(`${checkout}/v2/current.json`, "utf8"), "previous\n");
});

test("once the site serves its own data, the mirror clones the data repository sparsely, puts the snapshot in its v2, commits and pushes", async () => {
  const { calls, git } = recordingGit(true);
  const checkout = `${await temporaryDir()}/lcdg-data`;
  await mirror(await snapshot(), VERSION, { fetcher: answering(POINTER).fetcher, git, checkout });
  assert.deepEqual(calls, [
    ["clone", "--filter=blob:none", "--no-checkout", "git@github.com:brissa-a/lcdg-data.git", checkout],
    ["-C", checkout, "sparse-checkout", "set", "--no-cone", "/v2/"],
    ["-C", checkout, "fetch", "--prune", "origin"],
    ["-C", checkout, "checkout", "--force", "-B", "main", "origin/main"],
    ["-C", checkout, "add", "--all", "--sparse", "v2"],
    ["-C", checkout, "diff", "--cached", "--quiet"],
    ["-C", checkout, "commit", "--quiet", "-m", `Mirror v2 data version ${VERSION}`],
    ["-C", checkout, "push", "--quiet", "origin", "main"],
  ]);
  assert.deepEqual((await readdir(`${checkout}/v2`)).sort(), [VERSION, "current.json"].sort());
  assert.equal(await readFile(`${checkout}/v2/${VERSION}/init.csv`, "utf8"), "id\nPA1\n");
});

test("a mirror whose staged v2 is unchanged reuses its clone, replaces its v2 by the snapshot and neither commits nor pushes", async () => {
  const { calls, git } = recordingGit(false);
  const checkout = await checkoutHolding("stale.csv", true);
  await mirror(await snapshot(), VERSION, { fetcher: answering(POINTER).fetcher, git, checkout });
  assert.deepEqual(
    calls.map((c) => c[2]),
    ["fetch", "checkout", "add", "diff"],
  );
  assert.deepEqual((await readdir(`${checkout}/v2`)).sort(), [VERSION, "current.json"].sort());
});

const shell = promisify(execFile);
const gitOutput = async (...args: string[]) => (await shell("git", args)).stdout.trim();

async function cloneOfLocalOrigin(): Promise<{ origin: string; checkout: string }> {
  const dir = await temporaryDir();
  const origin = `${dir}/origin.git`;
  const checkout = `${dir}/lcdg-data`;
  await gitOutput("init", "--quiet", "--bare", "--initial-branch=main", origin);
  await gitOutput("clone", "--quiet", origin, checkout);
  for (const [key, value] of [
    ["user.name", "Pipeline test"],
    ["user.email", "pipeline@example.test"],
    ["commit.gpgsign", "false"],
  ] as const)
    await gitOutput("-C", checkout, "config", key, value);
  await mkdir(`${checkout}/v2`);
  await writeFile(`${checkout}/v2/stale.csv`, "previous\n");
  await writeFile(`${checkout}/legacy.csv`, "kept\n");
  await gitOutput("-C", checkout, "add", "--all");
  await gitOutput("-C", checkout, "commit", "--quiet", "-m", "Legacy data");
  await gitOutput("-C", checkout, "push", "--quiet", "origin", "main");
  return { origin, checkout };
}

test("with real git, the mirror pushes one commit whose v2 is exactly the snapshot, keeps the files outside v2, and pushes nothing the second time", async () => {
  const { origin, checkout } = await cloneOfLocalOrigin();
  const tools = { fetcher: answering(POINTER).fetcher, git: runGit, checkout };
  const files = () => gitOutput("--git-dir", origin, "ls-tree", "-r", "--name-only", "main");

  await mirror(await snapshot(), VERSION, tools);
  assert.deepEqual((await files()).split("\n"), ["legacy.csv", `v2/${VERSION}/init.csv`, "v2/current.json"]);
  assert.equal(await gitOutput("--git-dir", origin, "log", "-1", "--format=%s", "main"), `Mirror v2 data version ${VERSION}`);
  const pushed = await gitOutput("--git-dir", origin, "rev-parse", "main");

  await mirror(await snapshot(), VERSION, tools);
  assert.equal(await gitOutput("--git-dir", origin, "rev-parse", "main"), pushed);
});
