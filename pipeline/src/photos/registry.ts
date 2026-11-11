import { readFile } from "node:fs/promises";
import { type JsonRecord, parseJson, record, text } from "../core/json.ts";
import { type IsoDate, isoDate } from "../core/types.ts";
import { type DeputyId, deputyId } from "../jobs/deputies.ts";
import { isMissing, replaceAtomically } from "../publication/files.ts";

export type Cutout = {
  readonly model: string;
  readonly date: IsoDate;
  readonly originalSha256: string;
};

export type Failure = {
  readonly model: string;
  readonly failedOn: IsoDate;
  readonly originalSha256: string;
  readonly reason: string;
};

export type Registry = Map<DeputyId, Cutout>;
export type Failures = Map<DeputyId, Failure>;

async function entries<T>(path: string, entry: (fields: JsonRecord, what: string) => T): Promise<Map<DeputyId, T>> {
  const content = await readFile(path, "utf8").catch((error: unknown) => {
    if (isMissing(error)) return "{}";
    throw error;
  });
  return new Map(
    Object.entries(record(parseJson(content), path)).map(([id, value]): [DeputyId, T] => [deputyId(id), entry(record(value, `${path} ${id}`), `${path} ${id}`)]),
  );
}

export const loadRegistry = (path: string): Promise<Registry> =>
  entries(path, (fields, what) => ({
    model: text(fields.model, `${what} model`),
    date: isoDate(text(fields.date, `${what} date`)),
    originalSha256: text(fields.originalSha256, `${what} originalSha256`),
  }));

export const loadFailures = (path: string): Promise<Failures> =>
  entries(path, (fields, what) => ({
    model: text(fields.model, `${what} model`),
    failedOn: isoDate(text(fields.failedOn, `${what} failedOn`)),
    originalSha256: text(fields.originalSha256, `${what} originalSha256`),
    reason: text(fields.reason, `${what} reason`),
  }));

export async function save(path: string, entries: ReadonlyMap<DeputyId, Cutout | Failure>): Promise<void> {
  const sorted = Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
  await replaceAtomically(path, JSON.stringify(sorted, null, 1) + "\n");
}
