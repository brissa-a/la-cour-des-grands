# Pipeline

Builds the v2 data of [cour-des-grands.fr](https://cour-des-grands.fr) from the Assemblée nationale open data, cuts out the deputies' photos, and publishes the result as an immutable snapshot in a local data root, which the site serves under `/data/v2/`.

## Running

```bash
npm install
npm run pipeline -- --data-root /path/to/data-root   # or LCDG_DATA_ROOT=/path/to/data-root
```

| Option | Effect |
|---|---|
| `--data-root <dir>` | Data root to publish to. Falls back to `LCDG_DATA_ROOT`, then to `/data`. The directory must exist. |
| `<job>` | Runs one job (e.g. `photos`, `deputies/init.csv`) into `output/` and publishes nothing. |
| `--skip-new-cutouts` | Computes no cutout: each photo waiting for one keeps its previous cutout, or the official photo (see [Photos](#photos)). |
| `--publish-rejected <version>` | Publishes a snapshot the guards refused, as is, once you have inspected it. Runs no job. Never used by the scheduled run. |
| `--push-to-remote` | After a run that publishes or finds nothing new, mirrors the current snapshot, photos included, to `v2/` on `main` of [brissa-a/lcdg-data](https://github.com/brissa-a/lcdg-data). Refused (exit 1, after `last.json`) while `https://cour-des-grands.fr/data/v2/current.json` names no version: a site that still reads its data from that repository cannot resolve the snapshot's relative photo paths. |

State kept between runs, next to the code: `cache/` (downloads, refreshed after 24 hours) and `output/photos/` (cutouts, `registry.json`, `failures.json`, and `uncut/`, the official photos as webp; losing it means cutting out every photo again). `output/v2/` is the working copy of the last build: only the files its `catalog.json` lists are published.

A run holds `<root>/v2/.lock` from start to end, since two runs would share `cache/` and `output/` as well as the data root: a run started meanwhile exits with 4 and changes nothing. The lock is released on exit, and on `SIGINT` and `SIGTERM`, which also kill the cutout in progress; after a `SIGKILL` or an out-of-memory kill it stays, its content names the process that held it, and the next runs exit with 4 until it is deleted by hand. A single-job run takes no lock.

## Photos

The `photos` job downloads each deputy's official photo (`output/photos/originals/`, refreshed after 24 hours; when the Assemblée nationale cannot serve it, the previous one is kept, and a deputy without one gets no photo), then cuts out the ones whose cutout is missing or was made from another photo or model, with [BRIA RMBG 2.0](https://huggingface.co/briaai/RMBG-2.0) on the CPU, deputies in office first. A cutout never stops the data from being published:

- the cutouts start once every other data file is built, so that none runs beside the address files (1.7 to 2 GB);
- each cutout runs in a process of its own (`src/photos/cutoutChild.ts`), killed after 10 minutes, which makes itself the kernel's first pick (`oom_score_adj` 1000) before loading onnxruntime: when the kernel kills it for memory, the run goes on;
- a run starts no new cutout after 30 minutes of them; the photos left wait for the next run;
- a photo whose cutout failed is tried again after 7 days, or as soon as its official photo or the model changes (`failures.json`). Each cutout is recorded there as failed before it starts, and cleared when it succeeds: a run killed during a cutout does not start with the same photo the next night;
- until its cutout is done, a deputy keeps the previous cutout, or gets the official photo as is, background included, as webp (`uncut/`): the site shows it as it would a cutout. A photo that cannot be read at all is left out.

`last.json` counts the cutouts that failed during the run, and the photos still waiting.

## Data root

```
<root>/v2/
  current.json                 {"version":"<40 hex>","publishedAt":"<ISO 8601 UTC>"}
  <version>/                   one complete, immutable snapshot
    catalog.json, deputies/…, votes/…, seats/…, communes/…
    photos/<deputy id>.webp
  .store/<sha256>              one read-only copy of each file content, hard-linked into the snapshots
  .rejected/<version>/         snapshots the guards refused, the 3 newest
  .runs/last.json              summary of the last run
  .staging/                    work in progress
  .trash/                      versions being deleted
  .lock                        held by the run in progress
```

- A snapshot is assembled in `.staging/`, then renamed to `<version>/`: a visible snapshot is always complete. A `<version>/` folder already there is reused only when its files hash to that version; otherwise it is replaced.
- `current.json` is replaced atomically (temporary file in `v2/`, then rename), once the snapshot is in place.
- The `photo` column holds paths relative to the snapshot root (`photos/PA1592.webp`).
- The ten most recently published versions are kept, plus the one `current.json` names. An older version is first renamed into `.trash/`, then deleted, so a deletion cut short never leaves part of a version in `v2/`. A store entry that no snapshot links to any more is deleted.
- Folders are `0755`, `current.json` `0644` and snapshot files `0444`, whatever the umask of the run: the server reads them as another user.
- Hidden entries (`.store`, `.rejected`, `.runs`, `.staging`, `.trash`, `.lock`) are not published data.

### Version

The version is the SHA-1 of the snapshot's manifest: one `<sha256>  <path>\n` line per file, sorted by path in byte order. The same content always gives the same version, so publishing it again does nothing. To check a snapshot by hand:

```bash
cd <root>/v2/<version>
find . -type f | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do sha256sum "$f"; done | sha1sum
```

`catalog.json` carries the build date and `deputies/init.csv` the deputies' ages, so a run on another day usually gives a new version.

## Guards

Before `current.json` moves, the candidate is checked, against the current version when there is one:

- at least 550 deputies, and no more than 2 % fewer than in the current version;
- no fewer votes than in the current version;
- every entry and every column of the current catalog still there;
- no empty file;
- each catalog entry matches its file: size, row count, header;
- every file the catalog references exists, and every value of an `image` column is the path of a file of the snapshot;
- no more than 5 % fewer filled values in an `image` column (the photos) than in the current version.

A refused candidate is moved to `.rejected/<version>/` and `current.json` stays as it was. Once inspected, `--publish-rejected <version>` publishes it.

## Exit codes and run summary

| Code | Meaning |
|---|---|
| 0 | Published, or unchanged |
| 1 | Failure: nothing published, or the mirror failed |
| 3 | Refused by the guards: nothing published |
| 4 | Another run holds the lock: nothing done, `last.json` untouched |
| 5 | Published, but old versions could not be pruned: see `warning` |
| other | Crash |

Every run writes `<root>/v2/.runs/last.json`:

```json
{
 "startedAt": "2026-11-07T04:00:00.000Z",
 "finishedAt": "2026-11-07T04:01:00.000Z",
 "status": "published | unchanged | rejected | failed",
 "exitCode": 0,
 "version": "<40 hex>, null on failure",
 "previousVersion": "<40 hex> or null",
 "forced": false,
 "counts": { "deputies": 654, "votes": 9759, "newVotes": 3 },
 "refusals": ["one sentence per refusal"],
 "warning": null,
 "cutouts": { "failed": [{ "id": "PA1008", "reason": "killed by SIGKILL, most likely for lack of memory" }], "waiting": 2 },
 "error": null
}
```

`counts` and `cutouts` are `null` on failure, and `cutouts` for a `--publish-rejected` run, which computes none. `cutouts.waiting` counts the photos still without a cutout of their current photo, besides those that failed. `newVotes` is `null` when there was no previous version. `warning` names a retention that failed after the publication or the refusal was settled. `forced` is `true` for a `--publish-rejected` run, whose `refusals` are those it overrode. When the data root is not a directory, the run exits with 1 and writes nothing. A `--push-to-remote` mirror that fails exits with 1 after `last.json` has recorded the publication.

## On the Dedibox

The service `lcdg-pipeline` of the server's compose project (`server/deploy/docker-compose.yml`, deployed by `server/deploy/deploy.sh`) runs this image (`deploy/Dockerfile`): uid 10002, read-only, the data root on the volume `lcdg-data` at `/data`, `cache/` and `output/` on the volumes `lcdg_pipeline-cache` and `lcdg_pipeline-output`, 2 CPUs at a quarter of the default weight, 8 GB of memory. [supercronic](https://github.com/aptible/supercronic) runs `node src/scheduled/main.ts run` every night at 04:30, Paris time (`deploy/crontab`), and waits on `SIGTERM` for the run in progress.

`src/scheduled/main.ts` wraps a run of the pipeline with alerts to Alexis's phone, through https://ntfy.kxv.fr as the user `lcdg_pipeline`, whose token is `NTFY_TOKEN`:

| Command | Effect |
|---|---|
| `check` | Exits 0 when `NTFY_TOKEN` is a token ntfy accepts for `lcdg_pipeline` and the data root is a directory this user can write, 78 otherwise. The container runs it before the scheduler (`deploy/scheduler.sh`): without it, no scheduler and no run. |
| `run [options]` | Runs the pipeline with these options (no job), passes its output through, then sends one notification and exits with the pipeline's code (128 + the signal's number when killed). Exits 78 without running anything when `NTFY_TOKEN` holds no token. |

| Outcome | Topic | Priority |
|---|---|---|
| Published or unchanged: version, counts, new votes, the photos still waiting for a cutout | `lcdg_pipeline-done` | 2 (low) |
| Published or unchanged, but cutouts failed: how many, the first five with their reason | `lcdg_pipeline-done` | 3 |
| Published, old versions not pruned (exit 5) | `lcdg_pipeline-done` | 3 |
| Refused by the guards (exit 3): each refusal from `last.json`, the command that publishes the candidate anyway | `lcdg_pipeline-rejected` | 4 (high) |
| Another run holds the lock (exit 4): its holder, the command that frees it | `lcdg_pipeline-locked` | 3 |
| Any other end: failure recorded in `last.json`, exit without a fresh `last.json`, a kill (out of memory when cgroup v2's `memory.events` counted one), with the end of the error output | `lcdg_pipeline-failed` | 4 (high) |

The pipeline never gets `NTFY_TOKEN`. A run's `last.json` counts only when it started after the run did. Once the pipeline has ended, however it ended, a lock that names that very process on this host is deleted: nobody else can hold it. A notification ntfy does not take is tried again after 10 s and 60 s, unless ntfy refuses it (4xx but 429), then logged; the run's exit code stays the pipeline's.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run mutate
```

To run the front or the server against a local build, set `LCDG_DATA_ROOT` to the data root itself (`<root>`, not `<root>/v2/<version>/`): both read `v2/current.json`, then the version it names.
