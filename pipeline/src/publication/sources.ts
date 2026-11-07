import { readFile } from "node:fs/promises";
import type { DeputyId } from "../jobs/deputies.ts";
import { publishedPhotoPath } from "../photos/paths.ts";
import { CATALOG_FILE, catalogFiles, parseCatalog } from "./catalog.ts";
import { type SnapshotPath, snapshotPath } from "./paths.ts";

export async function snapshotSources(outputDir: string, photos: ReadonlyMap<DeputyId, string>): Promise<Map<SnapshotPath, string>> {
  const catalog = parseCatalog(await readFile(`${outputDir}/${CATALOG_FILE}`, "utf8"));
  return new Map([
    ...catalogFiles(catalog).map((file): [SnapshotPath, string] => [file, `${outputDir}/${file}`]),
    ...[...photos].map(([id, source]): [SnapshotPath, string] => [snapshotPath(publishedPhotoPath(id)), source]),
  ]);
}
