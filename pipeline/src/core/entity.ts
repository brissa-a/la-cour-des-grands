import type { Job } from "./job.ts";

export type Entity<R> = {
  readonly name: string;
  readonly folder: string;
  readonly key: string;
  readonly rows: Job<R[]>;
  id(row: R): string;
};

export function entity<R>(definition: Entity<R>): Entity<R> {
  return definition;
}
