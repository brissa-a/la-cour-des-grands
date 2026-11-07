import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { deputyId } from "../jobs/deputies.ts";
import { temporaryDir } from "../publication/snapshots.fixture.ts";
import { type PhotoSource, officialPhoto, officialPhotoUrl } from "./officialPhoto.ts";

const ID = deputyId("PA1008");
const PREVIOUS = "previous photo";
const NEW = "new photo";
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

type Served = () => Promise<Response>;

async function source(served: Served, previous: "none" | "fresh" | "stale"): Promise<{ source: PhotoSource; requested: string[]; warnings: string[] }> {
  const originals = `${await temporaryDir()}/originals`;
  const requested: string[] = [];
  const warnings: string[] = [];
  if (previous !== "none") {
    await mkdir(originals, { recursive: true });
    await writeFile(`${originals}/${ID}.jpg`, PREVIOUS);
    const ageHours = previous === "fresh" ? 23 : 25;
    const at = new Date(Date.now() - ageHours * 3600_000);
    await utimes(`${originals}/${ID}.jpg`, at, at);
  }
  return {
    requested,
    warnings,
    source: {
      originals,
      fetch: (url) => {
        requested.push(url);
        return served();
      },
      warn: (line) => warnings.push(line),
    },
  };
}

const serve = (body: string, status = 200): Served => () => Promise.resolve(new Response(status === 200 ? body : null, { status }));

test("a photo downloaded less than a day ago is used as is, without asking the Assemblée", async () => {
  const { source: fresh, requested, warnings } = await source(serve(NEW), "fresh");
  assert.deepEqual(await officialPhoto(ID, fresh), { path: `${fresh.originals}/${ID}.jpg`, sha256: sha256(PREVIOUS) });
  assert.deepEqual([requested, warnings], [[], []]);
});

test("a photo older than a day, or never downloaded, is downloaded from the Assemblée and kept", async () => {
  for (const previous of ["stale", "none"] as const) {
    const { source: refreshed, requested, warnings } = await source(serve(NEW), previous);
    assert.deepEqual(await officialPhoto(ID, refreshed), { path: `${refreshed.originals}/${ID}.jpg`, sha256: sha256(NEW) });
    assert.equal(await readFile(`${refreshed.originals}/${ID}.jpg`, "utf8"), NEW);
    assert.deepEqual([requested, warnings], [[officialPhotoUrl(ID)], []]);
  }
});

test("a photo the Assemblée no longer has is missing", async () => {
  const { source: gone, warnings } = await source(serve("", 404), "stale");
  assert.equal(await officialPhoto(ID, gone), "missing");
  assert.deepEqual(warnings, []);
});

test("a photo the Assemblée cannot serve now keeps the previous original, or is missing without one, and says why", async () => {
  const unavailable: [Served, string][] = [
    [serve("", 503), "HTTP 503"],
    [() => Promise.reject(new TypeError("fetch failed", { cause: new Error("read ECONNRESET") })), "fetch failed: read ECONNRESET"],
    [() => Promise.reject(new Error("The operation was aborted due to timeout")), "The operation was aborted due to timeout"],
    [() => Promise.resolve(new Response(new ReadableStream({ start: (controller) => controller.error(new Error("terminated")) }))), "terminated"],
  ];
  for (const [served, reason] of unavailable) {
    const { source: kept, warnings } = await source(served, "stale");
    assert.deepEqual(await officialPhoto(ID, kept), { path: `${kept.originals}/${ID}.jpg`, sha256: sha256(PREVIOUS) }, reason);
    assert.deepEqual(warnings, [`  photo of ${ID}: ${reason}, keeping the previous original`]);
    const { source: none, warnings: noneWarnings } = await source(served, "none");
    assert.equal(await officialPhoto(ID, none), "missing", reason);
    assert.deepEqual(noneWarnings, [`  photo of ${ID}: ${reason}, treated as missing`]);
  }
});
