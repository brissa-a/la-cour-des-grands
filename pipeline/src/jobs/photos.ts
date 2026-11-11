import { today } from "../core/types.ts";
import { options } from "../argv.ts";
import { briaModel } from "../photos/bria.ts";
import { children } from "../photos/child.ts";
import { PHOTO_FILES } from "../photos/paths.ts";
import { photosJob } from "../photos/photosJob.ts";
import { deputies } from "./deputies.ts";
import { filesWithoutPhotos } from "./withoutPhotos.ts";

export const cutoutProcesses = children();

export const photos = photosJob({
  deputies,
  briaModel,
  cutoutsAfter: filesWithoutPhotos,
  files: PHOTO_FILES,
  fetch: (url) => fetch(url),
  processes: cutoutProcesses,
  skipNewCutouts: options.skipNewCutouts,
  today,
  clockMs: () => performance.now(),
  log: (line) => console.log(line),
  warn: (line) => console.warn(line),
});
