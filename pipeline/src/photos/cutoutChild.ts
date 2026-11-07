import { writeFile } from "node:fs/promises";
import { reasonOf } from "../publication/publish.ts";
import { backgroundRemover } from "./bria.ts";

const [model, original, cutout, ...extra] = process.argv.slice(2);
if (model === undefined || original === undefined || cutout === undefined || extra.length > 0) {
  console.error("usage: node src/photos/cutoutChild.ts <model.onnx> <original.jpg> <cutout.webp>");
  process.exitCode = 2;
} else {
  // Linux: the kernel's first pick when the container runs out of memory, before the pipeline that waits for it.
  await writeFile("/proc/self/oom_score_adj", "1000").catch(() => undefined);
  try {
    const removeBackground = await backgroundRemover(model);
    await writeFile(cutout, await removeBackground(original));
  } catch (error) {
    console.error(reasonOf(error));
    process.exitCode = 1;
  }
}
