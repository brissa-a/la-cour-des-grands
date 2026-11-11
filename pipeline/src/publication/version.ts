import { createHash } from "node:crypto";
import type { SnapshotPath } from "./paths.ts";

export type DataVersion = string & { readonly __brand: "DataVersion" };

export function dataVersion(value: string): DataVersion {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`Not a data version (40 lowercase hex digits): ${value}`);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the format test above proves a full lowercase SHA-1
  return value as DataVersion;
}

export type Sha256 = string & { readonly __brand: "Sha256" };

export function sha256Of(content: Uint8Array): Sha256 {
  const digest = createHash("sha256").update(content).digest("hex");
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: a sha256 hex digest of the content, computed right above
  return digest as Sha256;
}

export type ManifestLine = { readonly path: SnapshotPath; readonly sha256: Sha256 };

export function manifest(lines: readonly ManifestLine[]): string {
  return lines
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(({ path, sha256 }) => `${sha256}  ${path}\n`)
    .join("");
}

export const versionOf = (lines: readonly ManifestLine[]): DataVersion =>
  dataVersion(createHash("sha1").update(manifest(lines)).digest("hex"));
