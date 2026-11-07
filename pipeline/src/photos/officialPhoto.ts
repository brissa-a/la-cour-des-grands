import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import type { DeputyId } from "../jobs/deputies.ts";
import { reasonOf } from "../publication/publish.ts";

const MAX_AGE_HOURS = 24;

export type OfficialPhoto = {
  path: string;
  sha256: string;
};

export type PhotoSource = {
  readonly originals: string;
  readonly fetch: (url: string) => Promise<Response>;
  readonly warn: (line: string) => void;
};

type Download = { readonly kind: "downloaded"; readonly bytes: Uint8Array } | { readonly kind: "gone" } | { readonly kind: "unavailable"; readonly reason: string };

export function officialPhotoUrl(id: DeputyId): string {
  return `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/${id.slice(2)}.jpg`;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const withCause = (error: unknown): string =>
  error instanceof Error && error.cause instanceof Error ? `${reasonOf(error)}: ${reasonOf(error.cause)}` : reasonOf(error);

async function download(url: string, source: PhotoSource): Promise<Download> {
  try {
    const response = await source.fetch(url);
    if (response.status === 404) return { kind: "gone" };
    if (!response.ok) return { kind: "unavailable", reason: `HTTP ${response.status}` };
    return { kind: "downloaded", bytes: new Uint8Array(await response.arrayBuffer()) };
  } catch (error) {
    return { kind: "unavailable", reason: withCause(error) };
  }
}

export async function officialPhoto(id: DeputyId, source: PhotoSource): Promise<OfficialPhoto | "missing"> {
  const path = `${source.originals}/${id}.jpg`;
  const age = await stat(path).then(
    (s) => Date.now() - s.mtimeMs,
    () => Infinity,
  );
  const previous = async () => ({ path, sha256: sha256(await readFile(path)) });
  if (age < MAX_AGE_HOURS * 3600_000) return previous();
  const downloaded = await download(officialPhotoUrl(id), source);
  switch (downloaded.kind) {
    case "gone":
      return "missing";
    case "unavailable": {
      const fallback = age === Infinity ? "treated as missing" : "keeping the previous original";
      source.warn(`  photo of ${id}: ${downloaded.reason}, ${fallback}`);
      return age === Infinity ? "missing" : previous();
    }
    case "downloaded":
      await mkdir(source.originals, { recursive: true });
      await writeFile(path, downloaded.bytes);
      return { path, sha256: sha256(downloaded.bytes) };
  }
}
