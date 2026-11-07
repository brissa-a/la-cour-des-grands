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
| `--skip-new-cutouts` | Leaves out the photos that still need a cutout instead of computing it. |
| `--publish-rejected <version>` | Publishes a snapshot the guards refused, as is, once you have inspected it. Runs no job. Never used by the scheduled run. |
| `--push-to-remote` | After a run that publishes or finds nothing new, mirrors the current snapshot, photos included, to `v2/` on `main` of [brissa-a/lcdg-data](https://github.com/brissa-a/lcdg-data). Nothing automatic uses it. |

State kept between runs, next to the code: `cache/` (downloads, refreshed after 24 hours) and `output/photos/` (cutouts and `registry.json`; losing it means cutting out every photo again). `output/v2/` is the working copy of the last build: only the files its `catalog.json` lists are published.

Run one pipeline at a time (for instance with `flock -n` around the scheduled command): two runs share `cache/` and `output/`.

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
```

- A snapshot is assembled in `.staging/`, then renamed to `<version>/`: a visible snapshot is always complete.
- `current.json` is replaced atomically (temporary file in `v2/`, then rename), once the snapshot is in place.
- The `photo` column holds paths relative to the snapshot root (`photos/PA1592.webp`).
- The ten most recently published versions are kept, plus the one `current.json` names. A store entry that no snapshot links to any more is deleted.
- Hidden entries (`.store`, `.rejected`, `.runs`, `.staging`) are not published data.

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
- every file the catalog references exists, and every value of an `image` column is the path of a file of the snapshot.

A refused candidate is moved to `.rejected/<version>/` and `current.json` stays as it was. Once inspected, `--publish-rejected <version>` publishes it.

## Exit codes and run summary

| Code | Meaning |
|---|---|
| 0 | Published, or unchanged |
| 3 | Refused by the guards: nothing published |
| other | Failure |

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
 "error": null
}
```

`counts` is `null` on failure, and `newVotes` is `null` when there was no previous version. `forced` is `true` for a `--publish-rejected` run, whose `refusals` are those it overrode. When the data root itself is unusable, the run exits with 1 and writes nothing. A `--push-to-remote` mirror that fails exits with 1 after `last.json` has recorded the publication.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run mutate
```

To run the front against a local build, point `VITE_DATA_ROOT` at a published snapshot, `<root>/v2/<version>/`, which holds the photos.
