import { execFile } from "node:child_process";
import { access, cp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { type Dependencies, type Job, job } from "./job.ts";
import { today } from "./types.ts";

const PUBLISHED_FOLDER = "v2";

const run = promisify(execFile);
const git = (dir: string, ...args: string[]) => run("git", ["-C", dir, ...args]);

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export function publish(definition: {
  repository: string;
  from: string;
  branch: string;
  after: Dependencies;
}): Job<void> {
  const { repository, branch } = definition;
  const dir = `cache/remotes/${repository.replace("/", "-")}`;
  return job({
    name: `publish ${repository}@${branch}`,
    dependencies: definition.after,
    async run() {
      if (!(await exists(`${dir}/.git`))) {
        // Sparse and blobless: the data repositories hold large legacy files the site still reads.
        await run("git", ["clone", "--filter=blob:none", "--no-checkout", `git@github.com:${repository}.git`, dir]);
        await git(dir, "sparse-checkout", "set", "--no-cone", `/${PUBLISHED_FOLDER}/`);
      }
      await git(dir, "fetch", "--prune", "origin");
      const remoteBranchExists = await git(dir, "rev-parse", "--verify", "--quiet", `origin/${branch}`).then(
        () => true,
        () => false,
      );
      await git(dir, "checkout", "--force", "-B", branch, remoteBranchExists ? `origin/${branch}` : "origin/HEAD");

      await rm(`${dir}/${PUBLISHED_FOLDER}`, { recursive: true, force: true });
      await cp(definition.from, `${dir}/${PUBLISHED_FOLDER}`, { recursive: true });
      await git(dir, "add", "--all", "--sparse", PUBLISHED_FOLDER);
      const unchanged = await git(dir, "diff", "--cached", "--quiet").then(
        () => true,
        () => false,
      );
      if (unchanged) {
        console.log(`  ${repository}@${branch}: already up to date`);
        return;
      }
      await git(dir, "commit", "--quiet", "-m", `Update ${PUBLISHED_FOLDER} data (${today()})`);
      await git(dir, "push", "--quiet", "origin", branch);
    },
  });
}
