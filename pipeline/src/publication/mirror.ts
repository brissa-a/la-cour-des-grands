import { execFile } from "node:child_process";
import { access, cp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { PUBLISHED_FOLDER } from "./paths.ts";
import { parseCurrent } from "./publish.ts";
import type { DataVersion } from "./version.ts";

export const MIRROR_REPOSITORY = "brissa-a/lcdg-data";
export const MIRROR_BRANCH = "main";
export const SITE_POINTER = `https://cour-des-grands.fr/data/${PUBLISHED_FOLDER}/current.json`;

export type Fetch = (url: string) => Promise<Response>;
export type Git = (args: readonly string[]) => Promise<void>;

export interface MirrorTools {
  readonly fetcher: Fetch;
  readonly git: Git;
  readonly checkout: string;
}

export async function siteServesItsOwnData(fetcher: Fetch): Promise<boolean> {
  const response = await fetcher(SITE_POINTER);
  if (!response.ok) return false;
  try {
    parseCurrent(await response.text(), SITE_POINTER);
    return true;
  } catch {
    return false;
  }
}

const run = promisify(execFile);

export const runGit: Git = (args) => run("git", args).then(() => undefined);

const realTools: MirrorTools = {
  fetcher: fetch,
  git: runGit,
  checkout: `cache/remotes/${MIRROR_REPOSITORY.replace("/", "-")}`,
};

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

// A site that still reads its data from the mirror cannot resolve the snapshot's relative photo paths.
export async function mirror(snapshotDir: string, version: DataVersion, tools: MirrorTools = realTools): Promise<void> {
  if (!(await siteServesItsOwnData(tools.fetcher)))
    throw new Error(`${SITE_POINTER} names no data version, so the site still reads ${MIRROR_REPOSITORY} and its portraits would break: nothing was mirrored`);
  const dir = tools.checkout;
  const git = (...args: string[]) => tools.git(["-C", dir, ...args]);
  if (!(await exists(`${dir}/.git`))) {
    // Sparse and blobless: the data repository holds large legacy files outside the published folder.
    await tools.git(["clone", "--filter=blob:none", "--no-checkout", `git@github.com:${MIRROR_REPOSITORY}.git`, dir]);
    await git("sparse-checkout", "set", "--no-cone", `/${PUBLISHED_FOLDER}/`);
  }
  await git("fetch", "--prune", "origin");
  await git("checkout", "--force", "-B", MIRROR_BRANCH, `origin/${MIRROR_BRANCH}`);
  await rm(`${dir}/${PUBLISHED_FOLDER}`, { recursive: true, force: true });
  await cp(snapshotDir, `${dir}/${PUBLISHED_FOLDER}`, { recursive: true });
  await git("add", "--all", "--sparse", PUBLISHED_FOLDER);
  const unchanged = await git("diff", "--cached", "--quiet").then(
    () => true,
    () => false,
  );
  if (unchanged) {
    console.log(`  ${MIRROR_REPOSITORY}@${MIRROR_BRANCH}: already up to date`);
    return;
  }
  await git("commit", "--quiet", "-m", `Mirror ${PUBLISHED_FOLDER} data version ${version}`);
  await git("push", "--quiet", "origin", MIRROR_BRANCH);
}
