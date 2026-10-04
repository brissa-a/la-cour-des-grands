import { readFile, writeFile } from "node:fs/promises";
import type { IsoDate } from "../core/types.ts";
import type { DeputyId } from "../jobs/deputies.ts";
import type { Model } from "./rembg.ts";

export type Cutout = {
  model: Model;
  date: IsoDate;
  originalSha256: string;
};

export type Registry = Map<DeputyId, Cutout>;

const PATH = "cache/nobg/registry.json";

export async function loadRegistry(): Promise<Registry> {
  const text = await readFile(PATH, "utf8").catch(() => "{}");
  return new Map(Object.entries(JSON.parse(text) as Record<DeputyId, Cutout>)) as Registry;
}

export async function saveRegistry(registry: Registry): Promise<void> {
  const sorted = Object.fromEntries([...registry].sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(PATH, JSON.stringify(sorted, null, 1) + "\n");
}
