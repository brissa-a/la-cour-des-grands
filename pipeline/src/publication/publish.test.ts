import assert from "node:assert/strict";
import { chmod, mkdir, readFile, readdir, stat, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test } from "node:test";
import { exists, filesUnder } from "./files.ts";
import { type DataRoot, type SnapshotPath, layout, snapshotPath } from "./paths.ts";
import { KEPT_REJECTED, KEPT_VERSIONS, type Outcome, publish, publishRejected, pruneVersions, readCurrent } from "./publish.ts";
import { EXIT_REJECTED, exitCode } from "./runs.ts";
import { COUNTED, type CatalogJson, type Contents, clock, sources, standard, temporaryRoot } from "./snapshots.fixture.ts";
import { readSnapshot, stage } from "./store.ts";
import { type DataVersion, dataVersion } from "./version.ts";

const publishContents = async (root: DataRoot, contents: Contents, now: () => Date, edit?: (catalog: CatalogJson) => void): Promise<Outcome> =>
  publish({ root, sources: await sources(contents, edit), counted: COUNTED, now });

async function published(root: DataRoot, contents: Contents, now: () => Date): Promise<DataVersion> {
  const outcome = await publishContents(root, contents, now);
  if (outcome.status !== "published") throw new Error(`expected a publication, got ${outcome.status}`);
  return outcome.version;
}

const listed = async (dir: string): Promise<string[]> => (await exists(dir) ? (await readdir(dir)).sort() : []);
const visibleVersions = async (root: DataRoot): Promise<DataVersion[]> =>
  (await listed(layout(root).v2)).flatMap((n) => (/^[0-9a-f]{40}$/.test(n) ? [dataVersion(n)] : []));
const pointer = (root: DataRoot): Promise<string> => readFile(layout(root).current, "utf8");

test("a publication makes the whole snapshot visible under its version, then points current.json at it", async () => {
  const root = await temporaryRoot();
  const contents = standard({ photos: 2 });
  const files = await sources(contents);
  const outcome = await publish({ root, sources: files, counted: COUNTED, now: clock() });
  assert.equal(outcome.status, "published");
  const { version } = outcome;
  assert.equal(await readFile(`${root}/v2/current.json`, "utf8"), `{"version":"${version}","publishedAt":"2026-11-07T04:00:00.000Z"}\n`);
  const dir = `${root}/v2/${version}`;
  assert.deepEqual((await filesUnder(dir)).sort(), [...files.keys()].sort());
  for (const [path, source] of files) assert.deepEqual(await readFile(`${dir}/${path}`), await readFile(source), path);
  assert.equal((await readSnapshot(dir)).version, version);
});

const asRoot = process.getuid?.() === 0 && "root ignores folder permissions";

const modeOf = async (path: string): Promise<number> => (await stat(path)).mode & 0o777;

async function withUmask<T>(mask: number, action: () => Promise<T>): Promise<T> {
  const previous = process.umask(mask);
  try {
    return await action();
  } finally {
    process.umask(previous);
  }
}

test("a published snapshot can be read by a server running as another user whatever the umask, and its files cannot be changed in place", async () => {
  const root = await temporaryRoot();
  const contents = standard();
  const nested = { ...contents, files: { ...contents.files, "communes/addresses/2A004.csv": "address\n" } };
  const version = await withUmask(0o077, () => published(root, nested, clock()));
  const paths = layout(root);
  const dir = paths.version(version);
  const folders = [paths.v2, dir, `${dir}/deputies`, `${dir}/deputies/values`, `${dir}/photos`, `${dir}/votes`, `${dir}/communes`, `${dir}/communes/addresses`];
  for (const folder of folders) assert.equal(await modeOf(folder), 0o755, folder);
  for (const file of ["photos/PA1.webp", "deputies/init.csv", "catalog.json"]) assert.equal(await modeOf(`${dir}/${file}`), 0o444, file);
  assert.equal(await modeOf(paths.current), 0o644);
});

test("a snapshot is assembled under v2/.staging, on the file system of the versions it is renamed among", async () => {
  const root = await temporaryRoot();
  const paths = layout(root);
  const staged = await stage(paths, await sources(standard()));
  assert.equal(dirname(staged.dir), paths.staging);
});

test("current.json moves only once the snapshot is in place: when the rename fails, the pointer stays where it was", { skip: asRoot }, async () => {
  const root = await temporaryRoot();
  const now = clock();
  const previous = await published(root, standard({ votes: ["V1", "V2"] }), now);
  const before = await pointer(root);
  const refused = await publishContents(root, standard({ votes: ["V1"] }), now);
  const rejected = layout(root).rejected;
  await chmod(rejected, 0o555);
  try {
    await assert.rejects(publishRejected(root, refused.version, COUNTED, now), { code: "EACCES" });
  } finally {
    await chmod(rejected, 0o755);
  }
  assert.equal(await pointer(root), before);
  assert.deepEqual(await visibleVersions(root), [previous]);
});

async function withOldestUndeletable(root: DataRoot, action: (versions: readonly DataVersion[]) => Promise<void>): Promise<void> {
  const now = clock();
  const versions: DataVersion[] = [];
  for (let i = 0; i < KEPT_VERSIONS; i++) versions.push(await published(root, standard({ extra: String(i) }), now));
  const paths = layout(root);
  const [oldest] = versions;
  if (oldest === undefined) throw new Error("no version published");
  await chmod(`${paths.version(oldest)}/deputies`, 0o555);
  try {
    await action(versions);
  } finally {
    for (const trashed of await listed(paths.trash)) await chmod(`${paths.trash}/${trashed}/deputies`, 0o755);
  }
}

test("an old version is moved out of v2/ before it is deleted, so a deletion that fails halfway never leaves part of it visible", { skip: asRoot }, async () => {
  const root = await temporaryRoot();
  await withOldestUndeletable(root, async (versions) => {
    const latest = await published(root, standard({ extra: "new" }), clock(Date.parse("2026-11-08T04:00:00.000Z")));
    assert.deepEqual(new Set(await visibleVersions(root)), new Set([...versions.slice(1), latest]));
  });
});

test("a retention that fails once the pointer has moved, now or at the next run, leaves a publication with its version, counts and the warning, not a failure", { skip: asRoot }, async () => {
  const root = await temporaryRoot();
  const now = clock(Date.parse("2026-11-08T04:00:00.000Z"));
  await withOldestUndeletable(root, async (versions) => {
    const outcome = await publishContents(root, standard({ extra: "new" }), now);
    assert.equal(outcome.status === "published" && outcome.previous, versions.at(-1));
    assert.match(outcome.status === "published" ? (outcome.warning ?? "") : "", /^Old versions could not be pruned: .*EACCES/);
    assert.deepEqual(outcome.counts, { deputies: 600, votes: 3, newVotes: 0 });
    assert.equal(exitCode(outcome), 5);
    assert.equal((await readCurrent(root))?.version, outcome.version);
    const next = await publishContents(root, standard({ extra: "stuck" }), now);
    assert.match(next.status === "published" ? (next.warning ?? "") : next.status, /^Old versions could not be pruned: .*EACCES/);
  });
  const retried = await publishContents(root, standard({ extra: "after" }), now);
  assert.equal(retried.status === "published" && retried.warning, null);
  assert.deepEqual(await listed(layout(root).trash), []);
});

test("an existing v2/<version> folder that does not hold that version is replaced, never reused", async () => {
  const contents = standard({ extra: "target" });
  const version = await published(await temporaryRoot(), contents, clock());
  const root = await temporaryRoot();
  const now = clock();
  await published(root, standard(), now);
  const partial = layout(root).version(version);
  await mkdir(`${partial}/votes`, { recursive: true });
  await writeFile(`${partial}/votes/votes.csv`, "vote_id,title\n");
  assert.equal(await published(root, contents, now), version);
  assert.equal((await readSnapshot(partial)).version, version);
});

test("publishing the same content again is a no-op: same version, pointer and snapshots", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const version = await published(root, standard(), now);
  const before = await pointer(root);
  const again = await publishContents(root, standard(), now);
  assert.deepEqual(again, { status: "unchanged", version, counts: { deputies: 600, votes: 3, newVotes: 0 } });
  assert.equal(exitCode(again), 0);
  assert.equal(await pointer(root), before);
  assert.deepEqual(await visibleVersions(root), [version]);
});

test("a failure while staging leaves no snapshot visible and the pointer where it was", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const version = await published(root, standard(), now);
  const before = await pointer(root);
  const files = await sources(standard({ votes: ["V1", "V2", "V3", "V4"] }));
  const broken = new Map<SnapshotPath, string>([...files].map(([path, source]) => [path, path === "votes/votes.csv" ? dirname(source) : source]));
  await assert.rejects(publish({ root, sources: broken, counted: COUNTED, now }), { code: "EISDIR" });
  assert.deepEqual(await visibleVersions(root), [version]);
  assert.equal(await pointer(root), before);
  assert.deepEqual(await listed(layout(root).staging), []);
});

test("a failure while checking a staged candidate leaves no snapshot visible and the pointer where it was", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const version = await published(root, standard(), now);
  const before = await pointer(root);
  const unterminated = 'vote_id,title\nV1,"vote\n';
  const contents = standard();
  const brokenVotes = { ...contents, files: { ...contents.files, "votes/votes.csv": unterminated } };
  await assert.rejects(
    publishContents(root, brokenVotes, now, (c) => {
      const votes = c.files.find((f) => f.file === "votes/votes.csv");
      if (votes !== undefined) votes.size = Buffer.byteLength(unterminated);
    }),
    /Unterminated/,
  );
  assert.deepEqual(await visibleVersions(root), [version]);
  assert.equal(await pointer(root), before);
  assert.deepEqual(await listed(layout(root).staging), []);
});

test("the leftovers of an interrupted run are cleared and never published", async () => {
  const root = await temporaryRoot();
  const leftover = `${layout(root).staging}/interrupted`;
  await mkdir(leftover, { recursive: true });
  await writeFile(`${leftover}/catalog.json`, "{");
  const version = await published(root, standard(), clock());
  assert.deepEqual(await visibleVersions(root), [version]);
  assert.deepEqual(await listed(layout(root).staging), []);
});

test("the ten newest versions are kept, older ones are removed", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const versions: DataVersion[] = [];
  for (let i = 0; i < KEPT_VERSIONS + 2; i++) versions.push(await published(root, standard({ extra: String(i) }), now));
  assert.equal(KEPT_VERSIONS, 10);
  assert.deepEqual(await visibleVersions(root), versions.slice(2).sort());
  assert.equal((await readCurrent(root))?.version, versions.at(-1));
});

test("going back to an older version keeps its folder in place and makes it the newest for retention", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const versions: DataVersion[] = [];
  for (let i = 0; i < KEPT_VERSIONS; i++) versions.push(await published(root, standard({ extra: String(i) }), now));
  const [oldest] = versions;
  if (oldest === undefined) throw new Error("no version published");
  const folder = (await stat(layout(root).version(oldest))).ino;
  assert.equal(await published(root, standard({ extra: "0" }), now), oldest);
  assert.equal((await stat(layout(root).version(oldest))).ino, folder);
  const latest = await published(root, standard({ extra: "new" }), now);
  assert.deepEqual(new Set(await visibleVersions(root)), new Set([latest, versions[0], ...versions.slice(2)]));
});

test("the current version is kept even when it is older than the ten newest", async () => {
  const root = await temporaryRoot();
  const paths = layout(root);
  const names = Array.from({ length: KEPT_VERSIONS + 2 }, (_, i) => dataVersion(String(i).padStart(2, "0").repeat(20)));
  for (const [i, name] of names.entries()) {
    await mkdir(paths.version(name), { recursive: true });
    await utimes(paths.version(name), 1_000_000 + i, 1_000_000 + i);
  }
  await writeFile(paths.current, JSON.stringify({ version: names[0], publishedAt: "2026-11-07T04:00:00.000Z" }));
  const others = [`${names[1]}.bak`, `x${names[1]}`];
  for (const other of others) await mkdir(`${paths.v2}/${other}`);
  await pruneVersions(root);
  assert.deepEqual(await visibleVersions(root), names.filter((_, i) => i !== 1));
  for (const other of others) assert.ok(await exists(`${paths.v2}/${other}`), other);
});

test("identical files are stored once and hard-linked into each version, and unlinked ones leave the store", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const first = await published(root, standard({ extra: "a" }), now);
  const second = await published(root, standard({ extra: "b" }), now);
  const paths = layout(root);
  const photo = "photos/PA1.webp";
  assert.equal((await stat(`${paths.version(first)}/${photo}`)).ino, (await stat(`${paths.version(second)}/${photo}`)).ino);
  assert.equal((await stat(`${paths.version(first)}/votes/votes.csv`)).ino === (await stat(`${paths.version(second)}/votes/votes.csv`)).ino, false);

  for (let i = 0; i < KEPT_VERSIONS; i++) await published(root, standard({ extra: `c${i}` }), now);
  const linked = new Set<string>();
  for (const version of await visibleVersions(root)) {
    for (const file of await filesUnder(paths.version(version))) linked.add(String((await stat(`${paths.version(version)}/${file}`)).ino));
  }
  const stored = await readdir(paths.store);
  assert.deepEqual(new Set(await Promise.all(stored.map(async (name) => String((await stat(`${paths.store}/${name}`)).ino)))), linked);
  assert.equal(stored.length, linked.size);
});

test("a refused candidate is kept aside for inspection, exits with 3 and leaves the pointer and versions alone", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const version = await published(root, standard({ deputies: 600 }), now);
  const before = await pointer(root);
  const outcome = await publishContents(root, standard({ deputies: 500 }), now);
  assert.equal(outcome.status, "rejected");
  assert.equal(exitCode(outcome), EXIT_REJECTED);
  assert.equal(EXIT_REJECTED, 3);
  assert.deepEqual(
    outcome.refusals.map((r) => r.guard),
    ["deputies-below-floor", "deputies-drop"],
  );
  assert.equal(await pointer(root), before);
  assert.deepEqual(await visibleVersions(root), [version]);
  assert.equal((await readSnapshot(`${layout(root).rejected}/${outcome.version}`)).version, outcome.version);
});

test("only the three newest refused candidates are kept", async () => {
  const root = await temporaryRoot();
  const now = clock();
  await published(root, standard(), now);
  const rejected: string[] = [];
  for (let i = 0; i < KEPT_REJECTED + 1; i++) {
    const outcome = await publishContents(root, standard({ votes: ["V1"], extra: String(i) }), now);
    rejected.push(outcome.version);
  }
  assert.equal(KEPT_REJECTED, 3);
  assert.deepEqual(await listed(layout(root).rejected), rejected.slice(1).sort());
});

test("a refused candidate named by its version is published as is, with the refusals it overrode", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const previous = await published(root, standard({ votes: ["V1", "V2"] }), now);
  const refused = await publishContents(root, standard({ votes: ["V1"] }), now);
  const outcome = await publishRejected(root, refused.version, COUNTED, now);
  assert.deepEqual(outcome, {
    status: "published",
    version: refused.version,
    previous,
    counts: { deputies: 600, votes: 1, newVotes: 0 },
    override: { refusals: [{ guard: "votes-drop", current: 2, candidate: 1 }] },
    warning: null,
  });
  assert.equal((await readCurrent(root))?.version, refused.version);
  assert.deepEqual(await visibleVersions(root), [previous, refused.version].sort());
  assert.deepEqual(await listed(layout(root).rejected), []);
});

test("a refused candidate whose files no longer match its version is not published", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const previous = await published(root, standard({ votes: ["V1", "V2"] }), now);
  const refused = await publishContents(root, standard({ votes: ["V1"] }), now);
  const tampered = `${layout(root).rejected}/${refused.version}/votes/votes.csv`;
  await unlink(tampered);
  await writeFile(tampered, "vote_id,title\nV1,changed\n");
  await assert.rejects(publishRejected(root, refused.version, COUNTED, now), /holds version/);
  assert.equal((await readCurrent(root))?.version, previous);
});

test("current.json is read only when it holds a full version and an ISO instant", async () => {
  const root = await temporaryRoot();
  assert.equal(await readCurrent(root), null);
  const paths = layout(root);
  await mkdir(paths.v2, { recursive: true });
  const version = "6a64dfbf2449e4c8357bc0319b9fe0b747c577d9";
  await writeFile(paths.current, JSON.stringify({ version, publishedAt: "2026-11-07T04:00:00.000Z" }));
  assert.deepEqual(await readCurrent(root), { version, publishedAt: "2026-11-07T04:00:00.000Z" });
  await writeFile(paths.current, JSON.stringify({ version: version.slice(0, 7), publishedAt: "2026-11-07T04:00:00.000Z" }));
  await assert.rejects(readCurrent(root), /data version/);
  for (const publishedAt of ["2026-11-07", "2026-11-07T05:00:00+01:00", "yesterday"]) {
    await writeFile(paths.current, JSON.stringify({ version, publishedAt }));
    await assert.rejects(readCurrent(root), /ISO 8601/, publishedAt);
  }
});

test("a file the build did not produce is left out of the snapshot, which the guards then refuse", async () => {
  const root = await temporaryRoot();
  const files = await sources(standard());
  files.set(snapshotPath("deputies/values/civility.csv"), `${root}/never-built.csv`);
  files.set(snapshotPath("votes/votes.csv"), `${root}/never-built.csv`);
  const outcome = await publish({ root, sources: files, counted: COUNTED, now: clock() });
  assert.equal(outcome.status, "rejected");
  assert.deepEqual(outcome.refusals, [
    { guard: "file-missing", file: "deputies/values/civility.csv" },
    { guard: "file-missing", file: "votes/votes.csv" },
  ]);
});

test("a first candidate refused with no current version publishes nothing, and can then be published by its version", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const refused = await publishContents(root, standard({ deputies: 500 }), now);
  assert.equal(refused.status, "rejected");
  assert.equal(await readCurrent(root), null);
  assert.deepEqual(await visibleVersions(root), []);
  const outcome = await publishRejected(root, refused.version, COUNTED, now);
  assert.equal(outcome.status === "published" && outcome.previous, null);
  assert.equal((await readCurrent(root))?.version, refused.version);
});

test("a refused candidate holding a symbolic link is not published", async () => {
  const root = await temporaryRoot();
  const now = clock();
  const previous = await published(root, standard({ votes: ["V1", "V2"] }), now);
  const refused = await publishContents(root, standard({ votes: ["V1"] }), now);
  await symlink("/etc/hosts", `${layout(root).rejected}/${refused.version}/hosts`);
  await assert.rejects(publishRejected(root, refused.version, COUNTED, now), /neither a file nor a directory/);
  assert.equal((await readCurrent(root))?.version, previous);
});

test("an unreadable current.json stops the run instead of being taken for a first publication", async () => {
  const root = await temporaryRoot();
  await mkdir(layout(root).current, { recursive: true });
  await assert.rejects(readCurrent(root), { code: "EISDIR" });
  await assert.rejects(publishContents(root, standard(), clock()), { code: "EISDIR" });
  assert.deepEqual(await visibleVersions(root), []);
});
