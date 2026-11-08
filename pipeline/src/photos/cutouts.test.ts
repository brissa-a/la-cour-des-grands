import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import sharp from "sharp";
import { type IsoDate, isoDate } from "../core/types.ts";
import { type DeputyId, deputyId } from "../jobs/deputies.ts";
import { temporaryDir } from "../publication/snapshots.fixture.ts";
import type { Attempt } from "./child.ts";
import { type Candidate, type CutoutPlan, RETRY_AFTER_DAYS, RUN_ENDED, choosePhotos } from "./cutouts.ts";
import { type PhotoFiles, photoFiles } from "./paths.ts";
import { type Failure, loadFailures, loadRegistry, save } from "./registry.ts";

const MODEL = "bria-rmbg";
const TODAY = isoDate("2026-11-07");
const CUT = "cut out";

const present = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function photo(files: PhotoFiles, id: DeputyId, gray: number, inOffice = true): Promise<Candidate> {
  const path = `${files.originals}/${id}.jpg`;
  await mkdir(files.originals, { recursive: true });
  await sharp({ create: { width: 24, height: 30, channels: 3, background: { r: gray, g: gray, b: gray } } })
    .jpeg()
    .toFile(path);
  return { id, inOffice, original: { path, sha256: createHash("sha256").update(await readFile(path)).digest("hex") } };
}

type Run = { readonly attempted: DeputyId[]; readonly lines: string[] };

function plan(files: PhotoFiles, outcome: (id: DeputyId) => Attempt | "done without a file" | "failed without a file", overrides: Partial<CutoutPlan> = {}): { plan: CutoutPlan; run: Run } {
  const run: Run = { attempted: [], lines: [] };
  return {
    run,
    plan: {
      files,
      model: MODEL,
      cutOut: async (original, cutout) => {
        const id = deputyId(original.replace(/^.*\/(PA\d+)\.jpg$/, "$1"));
        run.attempted.push(id);
        const result = outcome(id);
        if (result === "done without a file") return { kind: "done" };
        if (result === "failed without a file") return { kind: "failed", reason: "could not start: spawn node ENOENT" };
        await writeFile(cutout, result.kind === "done" ? CUT : "half a cutout");
        return result;
      },
      otherJobsDone: () => Promise.resolve(),
      budgetMs: 60_000,
      clockMs: () => 0,
      today: TODAY,
      log: (line) => run.lines.push(line),
      ...overrides,
    },
  };
}

const done = (): Attempt => ({ kind: "done" });
const killed = (): Attempt => ({ kind: "failed", reason: "killed by SIGKILL, most likely for lack of memory" });

async function cutBefore(files: PhotoFiles, candidate: Candidate, sha256 = candidate.original.sha256, model = MODEL): Promise<void> {
  await writeFile(files.cutout(candidate.id), "previous cutout");
  const registry = await loadRegistry(files.registry);
  registry.set(candidate.id, { model, date: isoDate("2026-01-01"), originalSha256: sha256 });
  await save(files.registry, registry);
}

async function failedBefore(files: PhotoFiles, candidate: Candidate, failedOn: IsoDate, changes: Partial<Failure> = {}): Promise<void> {
  const failures = await loadFailures(files.failures);
  failures.set(candidate.id, { model: MODEL, failedOn, originalSha256: candidate.original.sha256, reason: "killed", ...changes });
  await save(files.failures, failures);
}

const daysBefore = (days: number): IsoDate => isoDate(new Date(Date.parse(TODAY) - days * 86_400_000).toISOString().slice(0, 10));

async function files(): Promise<PhotoFiles> {
  return photoFiles(`${await temporaryDir()}/photos`);
}

test("a new photo is cut out, recorded, and published from its cutout; a current cutout is published without a new attempt", async () => {
  const photos = await files();
  const fresh = await photo(photos, deputyId("PA1"), 100);
  const current = await photo(photos, deputyId("PA2"), 120);
  await cutBefore(photos, current);
  const { plan: cutting, run } = plan(photos, done);
  const choice = await choosePhotos([fresh, current], cutting);
  assert.deepEqual(run.attempted, ["PA1"]);
  assert.deepEqual(
    choice.published,
    new Map([
      [fresh.id, photos.cutout(fresh.id)],
      [current.id, photos.cutout(current.id)],
    ]),
  );
  assert.deepEqual(choice.cutouts, { failed: [], waiting: 0 });
  assert.equal(await readFile(photos.cutout(fresh.id), "utf8"), CUT);
  assert.deepEqual((await loadRegistry(photos.registry)).get(fresh.id), { model: MODEL, date: TODAY, originalSha256: fresh.original.sha256 });
  assert.deepEqual(await readdir(photos.dir), ["PA1.webp", "PA2.webp", "failures.json", "originals", "registry.json"]);
  assert.deepEqual(run.lines, ["  1 photos to cut out with bria-rmbg once the other files are built, for 1 min at most", "  cutout of PA1 done (1/1)"]);
  const again = plan(photos, done);
  await choosePhotos([fresh, current], again.plan);
  assert.deepEqual([again.run.attempted, again.run.lines], [[], []]);
});

test("a cutout that fails keeps the deputy's previous cutout, records the failure, and reports it", async () => {
  const photos = await files();
  const changed = await photo(photos, deputyId("PA1"), 100);
  await cutBefore(photos, changed, "0".repeat(64));
  const { plan: cutting, run } = plan(photos, killed);
  const choice = await choosePhotos([changed], cutting);
  assert.deepEqual(choice.published, new Map([[changed.id, photos.cutout(changed.id)]]));
  assert.deepEqual(choice.cutouts, { failed: [{ id: changed.id, reason: "killed by SIGKILL, most likely for lack of memory" }], waiting: 0 });
  assert.equal(await readFile(photos.cutout(changed.id), "utf8"), "previous cutout");
  assert.equal(await present(`${photos.cutout(changed.id)}.partial`), false);
  assert.deepEqual((await loadFailures(photos.failures)).get(changed.id), {
    model: MODEL,
    failedOn: TODAY,
    originalSha256: changed.original.sha256,
    reason: "killed by SIGKILL, most likely for lack of memory",
  });
  assert.equal((await loadRegistry(photos.registry)).get(changed.id)?.originalSha256, "0".repeat(64));
  assert.deepEqual(run.lines.slice(1), [
    "  cutout of PA1 failed (1/1): killed by SIGKILL, most likely for lack of memory",
    "  cutouts: 1 failed, 0 still waiting; their deputies keep their previous cutout, or the official photo",
  ]);
});

test("a deputy without any cutout whose cutout fails is published with the official photo, background included, as webp", async () => {
  const photos = await files();
  const uncut = await photo(photos, deputyId("PA1"), 100);
  const choice = await choosePhotos([uncut], plan(photos, killed).plan);
  assert.deepEqual(choice.published, new Map([[uncut.id, photos.uncut(uncut.id)]]));
  const { format, width, height, hasAlpha } = await sharp(photos.uncut(uncut.id)).metadata();
  assert.deepEqual({ format, width, height, hasAlpha }, { format: "webp", width: 24, height: 30, hasAlpha: false });
  assert.equal(await present(photos.cutout(uncut.id)), false);
});

test("a photo whose cutout failed is not tried again for a week, unless its official photo or the model changed", async () => {
  const photos = await files();
  const [lately, aWeekAgo, changedPhoto, changedModel] = await Promise.all([1, 2, 3, 4].map((n) => photo(photos, deputyId(`PA${n}`), 50 * n)));
  if (lately === undefined || aWeekAgo === undefined || changedPhoto === undefined || changedModel === undefined) throw new Error("four photos");
  await failedBefore(photos, lately, daysBefore(RETRY_AFTER_DAYS - 1));
  await failedBefore(photos, aWeekAgo, daysBefore(RETRY_AFTER_DAYS));
  await failedBefore(photos, changedPhoto, TODAY, { originalSha256: "0".repeat(64) });
  await failedBefore(photos, changedModel, TODAY, { model: "u2net" });
  const { plan: cutting, run } = plan(photos, done);
  const choice = await choosePhotos([lately, aWeekAgo, changedPhoto, changedModel], cutting);
  assert.deepEqual(run.attempted, ["PA2", "PA3", "PA4"]);
  assert.deepEqual(choice.cutouts, { failed: [], waiting: 1 });
  assert.deepEqual([...(await loadFailures(photos.failures)).keys()], ["PA1"]);
  assert.equal(choice.published.get(lately.id), photos.uncut(lately.id));
});

test("once its budget is spent the run starts no other cutout, and the photos left wait with their fallback", async () => {
  const photos = await files();
  const candidates = await Promise.all([1, 2, 3].map((n) => photo(photos, deputyId(`PA${n}`), 50 * n)));
  let elapsed = 0;
  const { plan: cutting, run } = plan(
    photos,
    () => {
      elapsed += 40_000;
      return done();
    },
    { clockMs: () => elapsed },
  );
  const choice = await choosePhotos(candidates, cutting);
  assert.deepEqual(run.attempted, ["PA1", "PA2"]);
  assert.deepEqual(choice.cutouts, { failed: [], waiting: 1 });
  assert.equal(run.lines.at(-1), "  cutouts: 0 failed, 1 still waiting; their deputies keep their previous cutout, or the official photo");
  assert.deepEqual([...choice.published.values()], [photos.cutout(deputyId("PA1")), photos.cutout(deputyId("PA2")), photos.uncut(deputyId("PA3"))]);
  const skipped = plan(photos, done, { budgetMs: 0 });
  const nothing = await choosePhotos([...candidates, await photo(photos, deputyId("PA4"), 200)], skipped.plan);
  assert.deepEqual([skipped.run.attempted, nothing.cutouts], [[], { failed: [], waiting: 2 }]);
  assert.deepEqual([nothing.published.get(deputyId("PA3")), nothing.published.get(deputyId("PA4"))], [photos.uncut(deputyId("PA3")), photos.uncut(deputyId("PA4"))]);
});

test("no cutout starts before the other files are built, and the budget counts from then", async () => {
  const photos = await files();
  const candidates = await Promise.all([1, 2].map((n) => photo(photos, deputyId(`PA${n}`), 50 * n)));
  let now = 0;
  let built = (): void => undefined;
  const { plan: cutting, run } = plan(photos, done, {
    otherJobsDone: () =>
      new Promise((resolve) => {
        built = resolve;
      }),
    clockMs: () => now,
  });
  const choosing = choosePhotos(candidates, cutting);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(run.attempted, []);
  now = 120_000;
  built();
  assert.deepEqual((await choosing).cutouts, { failed: [], waiting: 0 });
  assert.deepEqual(run.attempted, ["PA1", "PA2"]);
});

test("a run killed during a cutout leaves that photo failed, so the next run starts with another one", async () => {
  const photos = await files();
  const [killedWith, next] = await Promise.all([1, 2].map((n) => photo(photos, deputyId(`PA${n}`), 50 * n)));
  if (killedWith === undefined || next === undefined) throw new Error("two photos");
  const dying = plan(photos, done, { cutOut: () => new Promise<Attempt>(() => undefined) });
  void choosePhotos([killedWith, next], dying.plan);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual((await loadFailures(photos.failures)).get(killedWith.id), { model: MODEL, failedOn: TODAY, originalSha256: killedWith.original.sha256, reason: RUN_ENDED });
  const { plan: nextNight, run } = plan(photos, done);
  const choice = await choosePhotos([killedWith, next], nextNight);
  assert.deepEqual(run.attempted, ["PA2"]);
  assert.deepEqual(choice.published.get(killedWith.id), photos.uncut(killedWith.id));
});

test("deputies in office are cut out first, and among them the photos that never failed before those that did", async () => {
  const photos = await files();
  const former = await photo(photos, deputyId("PA1"), 50, false);
  const retried = await photo(photos, deputyId("PA2"), 100);
  const fresh = await photo(photos, deputyId("PA3"), 150);
  await failedBefore(photos, retried, daysBefore(30));
  const { plan: cutting, run } = plan(photos, done);
  await choosePhotos([former, retried, fresh], cutting);
  assert.deepEqual(run.attempted, ["PA3", "PA2", "PA1"]);
});

test("a cutout whose process failed before writing anything is a failure like any other", async () => {
  const photos = await files();
  const candidate = await photo(photos, deputyId("PA1"), 100);
  const choice = await choosePhotos([candidate], plan(photos, () => "failed without a file").plan);
  assert.deepEqual(choice.cutouts.failed, [{ id: candidate.id, reason: "could not start: spawn node ENOENT" }]);
  assert.deepEqual(choice.published, new Map([[candidate.id, photos.uncut(candidate.id)]]));
});

test("a cutout said done that wrote no file is a failure, and a later success clears the failure", async () => {
  const photos = await files();
  const candidate = await photo(photos, deputyId("PA1"), 100);
  const missing = await choosePhotos([candidate], plan(photos, () => "done without a file").plan);
  assert.equal(missing.cutouts.failed.length, 1);
  assert.match(missing.cutouts.failed[0]?.reason ?? "", /^no cutout written: ENOENT/);
  await failedBefore(photos, candidate, daysBefore(RETRY_AFTER_DAYS));
  const retried = await choosePhotos([candidate], plan(photos, done).plan);
  assert.deepEqual(retried.cutouts, { failed: [], waiting: 0 });
  assert.deepEqual(await loadFailures(photos.failures), new Map());
});

test("an unreadable registry or failures list starts empty and says so, and an unreadable photo is left out, never stopping the run", async () => {
  const photos = await files();
  const candidate = await photo(photos, deputyId("PA1"), 100);
  const broken: Candidate = { id: deputyId("PA2"), inOffice: true, original: { path: `${photos.originals}/PA2.jpg`, sha256: "0".repeat(64) } };
  await writeFile(broken.original.path, "not a jpeg");
  await writeFile(photos.registry, "{");
  await writeFile(photos.failures, "[]");
  const { plan: cutting, run } = plan(photos, killed);
  const choice = await choosePhotos([candidate, broken], cutting);
  assert.deepEqual([...choice.published.keys()], ["PA1"]);
  assert.match(run.lines.join("\n"), /JSON[^\n]*: starting from an empty list\n.*failures\.json is not an object: starting from an empty list/);
  assert.match(run.lines.join("\n"), /photo of PA2 left out: /);
  assert.match(run.lines.join("\n"), /cutouts: 2 failed, 0 still waiting; their deputies keep their previous cutout, or the official photo/);
});
