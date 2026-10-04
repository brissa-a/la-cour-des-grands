import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IsoDate } from "../core/types.ts";
import type { DeputyId } from "../jobs/deputies.ts";
import type { Model } from "./bria.ts";
import { REGISTRY_PATH } from "./paths.ts";

export type Cutout = {
  model: Model;
  date: IsoDate;
  originalSha256: string;
};

export type Registry = Map<DeputyId, Cutout>;

export async function loadRegistry(): Promise<Registry> {
  const text = await readFile(REGISTRY_PATH, "utf8").catch(() => "{}");
  return new Map(Object.entries(JSON.parse(text) as Record<DeputyId, Cutout>)) as Registry;
}

export async function saveRegistry(registry: Registry): Promise<void> {
  const sorted = Object.fromEntries([...registry].sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(dirname(REGISTRY_PATH), { recursive: true });
  await writeFile(REGISTRY_PATH, JSON.stringify(sorted, null, 1) + "\n");
}
