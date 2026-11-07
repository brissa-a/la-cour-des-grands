import type { DeputyId } from "../jobs/deputies.ts";

export const PHOTOS_OUTPUT_DIR = "output/photos";
export const ORIGINALS_DIR = `${PHOTOS_OUTPUT_DIR}/originals`;
export const REGISTRY_PATH = `${PHOTOS_OUTPUT_DIR}/registry.json`;
export const cutoutPath = (id: DeputyId) => `${PHOTOS_OUTPUT_DIR}/${id}.webp`;
export const publishedPhotoPath = (id: DeputyId): `photos/${string}.webp` => `photos/${id}.webp`;
