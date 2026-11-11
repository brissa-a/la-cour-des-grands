import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { acquireLock } from "../publication/lock.ts";
import { layout } from "../publication/paths.ts";
import { temporaryRoot } from "../publication/snapshots.fixture.ts";
import { lockHolder, oomKills } from "./host.ts";

test("the holder of a run lock reads back as the pipeline wrote it", async () => {
  const root = await temporaryRoot();
  const locking = await acquireLock(root, { pid: 4242, host: "3f2a9c1b7d0e" }, new Date("2026-11-07T03:30:00.000Z"));
  assert.equal(locking.kind, "acquired");
  assert.deepEqual(lockHolder(await readFile(layout(root).lock, "utf8")), { pid: 4242, host: "3f2a9c1b7d0e", since: "2026-11-07T03:30:00.000Z" });
});

test("a lock file that does not name a process on a host is no holder", () => {
  for (const content of ["", "4242", "null", "[]", '{"pid":"4242","host":"box","since":"x"}', '{"pid":4242.5,"host":"box","since":"x"}', '{"pid":4242,"host":7,"since":"x"}', '{"pid":4242,"host":"box"}'])
    assert.equal(lockHolder(content), null, content);
});

test("the processes killed for the memory limit are counted from cgroup v2's memory.events, and nothing is counted from a file without that line", () => {
  assert.equal(oomKills("low 0\nhigh 0\nmax 12\noom 2\noom_kill 3\noom_group_kill 0\n"), 3);
  assert.equal(oomKills("low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n"), 0);
  assert.equal(oomKills("low 0\nhigh 0\nmax 812\noom 40\noom_kill 37\noom_group_kill 0\n"), 37);
  assert.equal(oomKills("low 0\noom 1\noom_group_kill 1\n"), null);
  assert.equal(oomKills(""), null);
});
