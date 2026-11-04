import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseJson, record, text } from "../core/json.ts";
import { type IsoDate, isoDate } from "../core/types.ts";
import { type DeputyId, deputyId } from "../jobs/deputies.ts";
import { REGISTRY_PATH } from "./paths.ts";

export type Cutout = {
  model: string;
  date: IsoDate;
  originalSha256: string;
};

export type Registry = Map<DeputyId, Cutout>;

export async function loadRegistry(): Promise<Registry> {
  const content = await readFile(REGISTRY_PATH, "utf8").catch(() => "{}");
  return new Map(
    Object.entries(record(parseJson(content), REGISTRY_PATH)).map(([id, value]): [DeputyId, Cutout] => {
      const cutout = record(value, `${REGISTRY_PATH} ${id}`);
      return [
        deputyId(id),
        {
          model: text(cutout.model, `${REGISTRY_PATH} ${id} model`),
          date: isoDate(text(cutout.date, `${REGISTRY_PATH} ${id} date`)),
          originalSha256: text(cutout.originalSha256, `${REGISTRY_PATH} ${id} originalSha256`),
        },
      ];
    }),
  );
}

export async function saveRegistry(registry: Registry): Promise<void> {
  const sorted = Object.fromEntries([...registry].sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(dirname(REGISTRY_PATH), { recursive: true });
  await writeFile(REGISTRY_PATH, JSON.stringify(sorted, null, 1) + "\n");
}
