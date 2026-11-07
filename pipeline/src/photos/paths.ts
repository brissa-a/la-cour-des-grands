import type { DeputyId } from "../jobs/deputies.ts";

export type PhotoFiles = {
  readonly dir: string;
  readonly originals: string;
  readonly registry: string;
  readonly failures: string;
  readonly cutout: (id: DeputyId) => string;
  readonly uncut: (id: DeputyId) => string;
};

export const photoFiles = (dir: string): PhotoFiles => ({
  dir,
  originals: `${dir}/originals`,
  registry: `${dir}/registry.json`,
  failures: `${dir}/failures.json`,
  cutout: (id) => `${dir}/${id}.webp`,
  uncut: (id) => `${dir}/uncut/${id}.webp`,
});

export const PHOTO_FILES = photoFiles("output/photos");

export const publishedPhotoPath = (id: DeputyId): `photos/${string}.webp` => `photos/${id}.webp`;
