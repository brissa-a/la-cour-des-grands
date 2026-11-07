export const PHOTOS_OUTPUT_DIR = "output/photos";
export const ORIGINALS_DIR = `${PHOTOS_OUTPUT_DIR}/originals`;
export const REGISTRY_PATH = `${PHOTOS_OUTPUT_DIR}/registry.json`;
export const cutoutPath = (id: string) => `${PHOTOS_OUTPUT_DIR}/${id}.webp`;
