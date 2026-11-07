import { execFile } from "node:child_process";
import { access, cp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { type Dependencies, type Job, job } from "./job.ts";
import { today } from "./types.ts";

export const PUBLISHED_FOLDER = "v2";
export const PUBLISHED_BRANCH = "main";

const run = promisify(execFile);
const git = (dir: string, ...args: string[]) => run("git", ["-C", dir, ...args]);

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export type Publication = {
  repository: string;
  from: string;
  after: Dependencies;
};

export type Publisher = (publication: Publication) => Job<void>;

export function publishPhotosThenData(
  photos: Publication,
  data: Publication,
  publisher: Publisher = publishToMain,
): [photos: Job<void>, data: Job<void>] {
  const photosPublication = publisher(photos);
  return [photosPublication, publisher({ ...data, after: { ...data.after, photosPublication } })];
}

function publishToMain(definition: Publication): Job<void> {
  const { repository } = definition;
  const dir = `cache/remotes/${repository.replace("/", "-")}`;
  return job({
    name: `publish ${repository}@${PUBLISHED_BRANCH}`,
    dependencies: definition.after,
    async run() {
      if (!(await exists(`${dir}/.git`))) {
        // Sparse and blobless: the data repositories hold large legacy files the site still reads.
        await run("git", ["clone", "--filter=blob:none", "--no-checkout", `git@github.com:${repository}.git`, dir]);
        await git(dir, "sparse-checkout", "set", "--no-cone", `/${PUBLISHED_FOLDER}/`);
      }
      await git(dir, "fetch", "--prune", "origin");
      await git(dir, "checkout", "--force", "-B", PUBLISHED_BRANCH, `origin/${PUBLISHED_BRANCH}`);

      await rm(`${dir}/${PUBLISHED_FOLDER}`, { recursive: true, force: true });
      await cp(definition.from, `${dir}/${PUBLISHED_FOLDER}`, { recursive: true });
      await git(dir, "add", "--all", "--sparse", PUBLISHED_FOLDER);
      const unchanged = await git(dir, "diff", "--cached", "--quiet").then(
        () => true,
        () => false,
      );
      if (unchanged) {
        console.log(`  ${repository}@${PUBLISHED_BRANCH}: already up to date`);
        return;
      }
      await git(dir, "commit", "--quiet", "-m", `Update ${PUBLISHED_FOLDER} data (${today()})`);
      await git(dir, "push", "--quiet", "origin", PUBLISHED_BRANCH);
    },
  });
}
