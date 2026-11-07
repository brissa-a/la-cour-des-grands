import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import sharp from "sharp";
import { isoDate } from "../core/types.ts";
import { deputyId } from "../jobs/deputies.ts";
import { temporaryDir } from "../publication/snapshots.fixture.ts";
import { type Attempt, type Children, children } from "./child.ts";
import { CUTOUT_CHILD, cutoutPlan } from "./cutoutPlan.ts";
import { type Candidate, choosePhotos } from "./cutouts.ts";
import { type PhotoFiles, photoFiles } from "./paths.ts";

const ID = deputyId("PA1008");
const done: Attempt = { kind: "done" };

const present = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function waitingPhoto(): Promise<{ files: PhotoFiles; candidate: Candidate; unreadableModel: string }> {
  const dir = await temporaryDir();
  const files = photoFiles(`${dir}/photos`);
  const path = `${files.originals}/${ID}.jpg`;
  await mkdir(files.originals, { recursive: true });
  await sharp({ create: { width: 24, height: 30, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .jpeg()
    .toFile(path);
  const unreadableModel = `${dir}/model.onnx`;
  await writeFile(unreadableModel, "not a model");
  const sha256 = createHash("sha256").update(await readFile(path)).digest("hex");
  return { files, candidate: { id: ID, inOffice: true, original: { path, sha256 } }, unreadableModel };
}

const settings = (files: PhotoFiles, modelPath: string, processes: Children, lines: string[], clockMs = () => performance.now()) => ({
  modelPath,
  files,
  processes,
  today: isoDate("2026-11-07"),
  clockMs,
  log: (line: string) => lines.push(line),
});

test("the cutout process refuses to run without its model, original and cutout, and says how to call it", async () => {
  assert.deepEqual(await children().run({ file: process.execPath, args: [CUTOUT_CHILD], timeoutMs: 30_000 }), {
    kind: "failed",
    reason: "usage: node src/photos/cutoutChild.ts <model.onnx> <original.jpg> <cutout.webp>",
  });
});

test("a run cuts out the photos waiting in a cutout process, whose failure leaves the official photo published", async () => {
  const { files, candidate, unreadableModel } = await waitingPhoto();
  const lines: string[] = [];
  const plan = cutoutPlan({ skipNewCutouts: false, ...settings(files, unreadableModel, children(), lines) });
  const choice = await choosePhotos([candidate], plan);
  assert.deepEqual(choice.cutouts, { failed: [{ id: ID, reason: `Load model from ${unreadableModel} failed:Protobuf parsing failed.` }], waiting: 0 });
  assert.deepEqual([...choice.published], [[ID, files.uncut(ID)]]);
  assert.deepEqual(await Promise.all([present(files.cutout(ID)), present(`${files.cutout(ID)}.partial`)]), [false, false]);
  assert.equal(lines[0], "  1 photos to cut out with bria-rmbg, for 30 min at most");
});

test("the cutout budget counts the time since the plan was made", () => {
  let now = 5_000;
  const plan = cutoutPlan({ skipNewCutouts: false, ...settings(photoFiles("unused"), "model.onnx", children(), [], () => now) });
  now = 5_600;
  assert.equal(plan.elapsedMs(), 600);
});

test("--skip-new-cutouts starts no cutout process: the photos waiting keep the official photo", async () => {
  const { files, candidate, unreadableModel } = await waitingPhoto();
  const started: string[][] = [];
  const spy: Children = {
    run: ({ args }) => {
      started.push([...args]);
      return Promise.resolve(done);
    },
    stop: () => undefined,
  };
  const choice = await choosePhotos([candidate], cutoutPlan({ skipNewCutouts: true, ...settings(files, unreadableModel, spy, []) }));
  assert.deepEqual(started, []);
  assert.deepEqual(choice.cutouts, { failed: [], waiting: 1 });
  assert.deepEqual([...choice.published], [[ID, files.uncut(ID)]]);
});
