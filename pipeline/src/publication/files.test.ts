import assert from "node:assert/strict";
import { chmod, mkdir, readdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { discard, exists } from "./files.ts";
import { temporaryDir } from "./snapshots.fixture.ts";

test("a discarded folder leaves its place at once, then is deleted from the trash", async () => {
  const dir = await temporaryDir();
  await mkdir(`${dir}/old/deputies`, { recursive: true });
  await writeFile(`${dir}/old/deputies/init.csv`, "deputy_id\n");
  await discard(`${dir}/old`, `${dir}/.trash`);
  assert.equal(await exists(`${dir}/old`), false);
  assert.deepEqual(await readdir(`${dir}/.trash`), []);
  await discard(`${dir}/never-there`, `${dir}/.trash`);
});

test("a folder that cannot be moved out is reported, not silently kept", { skip: process.getuid?.() === 0 && "root ignores folder permissions" }, async () => {
  const dir = await temporaryDir();
  await mkdir(`${dir}/locked/old`, { recursive: true });
  await chmod(`${dir}/locked`, 0o555);
  try {
    await assert.rejects(discard(`${dir}/locked/old`, `${dir}/.trash`), { code: "EACCES" });
  } finally {
    await chmod(`${dir}/locked`, 0o755);
  }
  assert.equal(await exists(`${dir}/locked/old`), true);
});
