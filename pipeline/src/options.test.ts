import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOptions } from "./options.ts";

test("a run stays local unless --push-to-remote is given", () => {
  assert.equal(parseOptions([]).pushToRemote, false);
  assert.equal(parseOptions(["--push-to-remote"]).pushToRemote, true);
});

test("a branch name is refused instead of being published to main", () => {
  assert.throws(() => parseOptions(["--push-to-remote", "--branch", "test-v2"]), { code: "ERR_PARSE_ARGS_UNKNOWN_OPTION" });
});

test("the first positional names the job and --skip-new-cutouts is read", () => {
  assert.deepEqual(parseOptions(["photos", "--skip-new-cutouts"]), { job: "photos", pushToRemote: false, skipNewCutouts: true });
  assert.equal(parseOptions([]).skipNewCutouts, false);
});
