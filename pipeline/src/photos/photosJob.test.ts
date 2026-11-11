import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import sharp from "sharp";
import type { Job } from "../core/job.ts";
import { isoDate } from "../core/types.ts";
import { type Deputy, deputyId } from "../jobs/deputies.ts";
import { constituencyCode } from "../jobs/address/codes.ts";
import { temporaryDir } from "../publication/snapshots.fixture.ts";
import type { ChildCommand } from "./child.ts";
import { type PhotoSettings, photosJob } from "./photosJob.ts";
import { photoFiles } from "./paths.ts";

const WITH_PHOTO = deputyId("PA1008");
const WITHOUT_PHOTO = deputyId("PA2009");
const SKIPPED = "  no cutout computed (--skip-new-cutouts)";

const ready = <T>(name: string, value: T): Job<T> => ({ name, result: () => Promise.resolve(value) });

function unbuilt(name: string): { readonly job: Job<undefined>; readonly build: () => void } {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  return { job: { name, result: () => promise }, build: () => resolve(undefined) };
}

const deputy = (id: Deputy["id"]): Deputy => ({
  id,
  civility: "Mme",
  lastName: id,
  firstName: id,
  birthDate: null,
  group: null,
  mandates: [
    {
      start: isoDate("2024-07-08"),
      end: null,
      endReason: null,
      constituency: constituencyCode("33-11"),
      region: "Nouvelle-Aquitaine",
      department: "33",
      departmentNumber: "33",
      constituencyNumber: "11",
      seat: null,
    },
  ],
});

type Seen = { readonly downloads: string[]; readonly cutouts: ChildCommand[]; readonly lines: string[]; downloading: number; mostAtOnce: number };

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

async function settings(
  cutoutsAfter: readonly Job<unknown>[],
  skipNewCutouts: boolean,
  ids: readonly Deputy["id"][] = [WITH_PHOTO, WITHOUT_PHOTO],
): Promise<{ settings: PhotoSettings; seen: Seen }> {
  const jpeg = await sharp({ create: { width: 24, height: 30, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .jpeg()
    .toBuffer();
  const seen: Seen = { downloads: [], cutouts: [], lines: [], downloading: 0, mostAtOnce: 0 };
  return {
    seen,
    settings: {
      deputies: ready("deputies", ids.map(deputy)),
      briaModel: ready("bria", "/models/bria.onnx"),
      cutoutsAfter,
      files: photoFiles(`${await temporaryDir()}/photos`),
      fetch: async (url) => {
        seen.downloads.push(url);
        seen.mostAtOnce = Math.max(seen.mostAtOnce, ++seen.downloading);
        await settle(5);
        seen.downloading--;
        return url.endsWith(`/${WITH_PHOTO.slice(2)}.jpg`) ? new Response(new Uint8Array(jpeg)) : new Response(null, { status: 404 });
      },
      processes: {
        run: async (command) => {
          seen.cutouts.push(command);
          const cutout = command.args.at(-1);
          if (cutout === undefined) throw new Error("a cutout path");
          await writeFile(cutout, "cut out");
          return { kind: "done" };
        },
        stop: () => undefined,
      },
      skipNewCutouts,
      today: () => isoDate("2026-11-08"),
      clockMs: () => 0,
      log: (line) => seen.lines.push(line),
      warn: (line) => seen.lines.push(line),
    },
  };
}

test("the photos are downloaded while the other files build, and no cutout starts before every one of them is built", async () => {
  const [hemicycle, rollFiles] = [unbuilt("hemicycle"), unbuilt("electoral roll")];
  const { settings: photos, seen } = await settings([hemicycle.job, rollFiles.job], false);
  const job = photosJob(photos);
  const choosing = job.result();
  await settle();
  assert.equal(seen.downloads.length, 2);
  assert.equal(seen.cutouts.length, 0);
  hemicycle.build();
  await settle();
  assert.equal(seen.cutouts.length, 0);
  rollFiles.build();
  const choice = await choosing;
  assert.deepEqual(
    seen.cutouts.map((c) => c.args.slice(1, 3)),
    [["/models/bria.onnx", `${photos.files.originals}/${WITH_PHOTO}.jpg`]],
  );
  assert.deepEqual(choice.cutouts, { failed: [], waiting: 0 });
  assert.deepEqual([...choice.published], [[WITH_PHOTO, photos.files.cutout(WITH_PHOTO)]]);
  assert.equal(seen.lines.includes(SKIPPED), false);
  assert.equal(job.name, "photos");
});

test("with --skip-new-cutouts the run says so and publishes the official photo", async () => {
  const { settings: photos, seen } = await settings([], true);
  const choice = await photosJob(photos).result();
  assert.equal(seen.lines[0], SKIPPED);
  assert.equal(seen.cutouts.length, 0);
  assert.deepEqual(choice.cutouts, { failed: [], waiting: 1 });
  assert.deepEqual([...choice.published], [[WITH_PHOTO, photos.files.uncut(WITH_PHOTO)]]);
});

test("the official photos download eight at a time, each once", async () => {
  const ids = Array.from({ length: 17 }, (_, n) => deputyId(`PA${3000 + n}`));
  const { settings: photos, seen } = await settings([], false, ids);
  await photosJob(photos).result();
  assert.equal(seen.mostAtOnce, 8);
  assert.equal(new Set(seen.downloads).size, 17);
  assert.equal(seen.downloads.length, 17);
});
