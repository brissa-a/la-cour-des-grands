import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { parseJson, record } from "../core/json.ts";
import { isoDate } from "../core/types.ts";
import { deputyId } from "../jobs/deputies.ts";
import { temporaryDir } from "../publication/snapshots.fixture.ts";
import { type Failures, type Registry, loadFailures, loadRegistry, save } from "./registry.ts";

test("the cutout registry and the failures list read back what was saved, sorted by deputy, and a missing file reads as empty", async () => {
  const dir = await temporaryDir();
  const registry: Registry = new Map([
    [deputyId("PA2"), { model: "bria-rmbg", date: isoDate("2026-11-06"), originalSha256: "b".repeat(64) }],
    [deputyId("PA10"), { model: "bria-rmbg", date: isoDate("2026-11-07"), originalSha256: "a".repeat(64) }],
  ]);
  const failures: Failures = new Map([[deputyId("PA3"), { model: "bria-rmbg", failedOn: isoDate("2026-11-07"), originalSha256: "c".repeat(64), reason: "killed by SIGKILL" }]]);
  await save(`${dir}/registry.json`, registry);
  await save(`${dir}/failures.json`, failures);
  assert.deepEqual(await loadRegistry(`${dir}/registry.json`), registry);
  assert.deepEqual(await loadFailures(`${dir}/failures.json`), failures);
  assert.deepEqual(Object.keys(record(parseJson(await readFile(`${dir}/registry.json`, "utf8")), "registry")), ["PA10", "PA2"]);
  assert.deepEqual(await loadRegistry(`${dir}/missing.json`), new Map());
  assert.deepEqual(await loadFailures(`${dir}/missing.json`), new Map());
});

test("a registry or failures list that is not one is refused, naming the file and the deputy", async () => {
  const dir = await temporaryDir();
  const cutout = { model: "bria-rmbg", date: "2026-11-07", originalSha256: "a".repeat(64) };
  const failure = { model: "bria-rmbg", failedOn: "2026-11-07", originalSha256: "a".repeat(64), reason: "timeout" };
  for (const [content, error] of [
    ["{", /JSON/],
    ["[]", /registry\.json is not an object/],
    [JSON.stringify({ PA1: "done" }), /registry\.json PA1 is not an object/],
    [JSON.stringify({ X1: cutout }), /Invalid deputy id: X1/],
    [JSON.stringify({ PA1: { ...cutout, model: 1 } }), /registry\.json PA1 model is not a string/],
    [JSON.stringify({ PA1: { ...cutout, date: "today" } }), /Invalid date: today/],
    [JSON.stringify({ PA1: { ...cutout, date: null } }), /registry\.json PA1 date is not a string/],
    [JSON.stringify({ PA1: { ...cutout, originalSha256: null } }), /registry\.json PA1 originalSha256 is not a string/],
  ] as const) {
    await writeFile(`${dir}/registry.json`, content);
    await assert.rejects(loadRegistry(`${dir}/registry.json`), error, content);
  }
  for (const [content, error] of [
    [JSON.stringify({ PA1: { ...failure, model: null } }), /failures\.json PA1 model is not a string/],
    [JSON.stringify({ PA1: { ...failure, failedOn: "2026-11" } }), /Invalid date: 2026-11/],
    [JSON.stringify({ PA1: { ...failure, failedOn: 0 } }), /failures\.json PA1 failedOn is not a string/],
    [JSON.stringify({ PA1: { ...failure, originalSha256: 0 } }), /failures\.json PA1 originalSha256 is not a string/],
    [JSON.stringify({ PA1: { ...failure, reason: null } }), /failures\.json PA1 reason is not a string/],
  ] as const) {
    await writeFile(`${dir}/failures.json`, content);
    await assert.rejects(loadFailures(`${dir}/failures.json`), error, content);
  }
  await mkdir(`${dir}/folder.json`);
  await assert.rejects(loadRegistry(`${dir}/folder.json`), /EISDIR/);
});
