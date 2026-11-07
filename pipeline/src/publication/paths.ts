import { resolve } from "node:path";
import type { DataVersion } from "./version.ts";

export type SnapshotPath = string & { readonly __brand: "SnapshotPath" };

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export function snapshotPath(value: string): SnapshotPath {
  if (!value.split("/").every((segment) => SEGMENT.test(segment))) throw new Error(`Not a path inside a snapshot: ${value}`);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: every segment is a plain, non-hidden name, so the path stays inside the snapshot
  return value as SnapshotPath;
}

export type DataRoot = string & { readonly __brand: "DataRoot" };

export function dataRoot(value: string): DataRoot {
  if (value === "") throw new Error("The data root is empty");
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: an absolute path, so a later change of working directory cannot move the root
  return resolve(value) as DataRoot;
}

export const PUBLISHED_FOLDER = "v2";

export const layout = (root: DataRoot) => {
  const v2 = `${root}/${PUBLISHED_FOLDER}`;
  return {
    v2,
    current: `${v2}/current.json`,
    version: (version: DataVersion) => `${v2}/${version}`,
    store: `${v2}/.store`,
    staging: `${v2}/.staging`,
    trash: `${v2}/.trash`,
    rejected: `${v2}/.rejected`,
    rejectedVersion: (version: DataVersion) => `${v2}/.rejected/${version}`,
    runs: `${v2}/.runs`,
    lock: `${v2}/.lock`,
  };
};
