import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOptions } from "./options.ts";

const VERSION = "0123456789abcdef0123456789abcdef01234567";

test("the git mirror is pushed only when --push-to-remote is given", () => {
  assert.equal(parseOptions([], {}).pushToRemote, false);
  assert.equal(parseOptions(["--push-to-remote"], {}).pushToRemote, true);
});

test("a branch name is refused instead of being published to main", () => {
  assert.throws(() => parseOptions(["--push-to-remote", "--branch", "test-v2"], {}), { code: "ERR_PARSE_ARGS_UNKNOWN_OPTION" });
});

test("the first positional names the job and --skip-new-cutouts is read", () => {
  assert.equal(parseOptions(["photos", "--skip-new-cutouts"], {}).job, "photos");
  assert.equal(parseOptions(["photos", "--skip-new-cutouts"], {}).skipNewCutouts, true);
  assert.equal(parseOptions([], {}).skipNewCutouts, false);
});

test("the data root comes from --data-root, else from LCDG_DATA_ROOT, else is /data, always made absolute", () => {
  assert.equal(parseOptions(["--data-root", "/srv/a"], { LCDG_DATA_ROOT: "/srv/b" }).dataRoot, "/srv/a");
  assert.equal(parseOptions([], { LCDG_DATA_ROOT: "/srv/b" }).dataRoot, "/srv/b");
  assert.equal(parseOptions([], {}).dataRoot, "/data");
  assert.equal(parseOptions(["--data-root", "relative"], {}).dataRoot, `${process.cwd()}/relative`);
  assert.throws(() => parseOptions([], { LCDG_DATA_ROOT: "" }), /empty/);
});

test("a rejected snapshot is published only when named by its full version, and never alongside a job", () => {
  assert.equal(parseOptions([], {}).publishRejected, null);
  assert.equal(parseOptions(["--publish-rejected", VERSION], {}).publishRejected, VERSION);
  assert.throws(() => parseOptions(["--publish-rejected", VERSION.slice(0, 12)], {}), /data version/);
  assert.throws(() => parseOptions(["--publish-rejected", VERSION, "photos"], {}), /runs no job/);
});
