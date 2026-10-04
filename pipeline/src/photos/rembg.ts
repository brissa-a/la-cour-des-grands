import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, parse, resolve } from "node:path";
import { promisify } from "node:util";

export const MODEL = "bria-rmbg";
export type Model = typeof MODEL;

const REMBG = ".venv-rembg/bin/rembg";

export async function removeBackgrounds(photos: string[], outputDir: string): Promise<Set<string>> {
  const work = await mkdtemp(join(tmpdir(), "lcdg-rembg-"));
  const input = join(work, "input");
  const output = join(work, "output");
  await mkdir(input);
  await mkdir(output);
  await Promise.all(photos.map((p) => copyFile(p, join(input, basename(p)))));
  try {
    await promisify(execFile)(REMBG, ["p", "-m", MODEL, input, output], {
      env: { ...process.env, U2NET_HOME: resolve("cache/models") },
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // onnxruntime sometimes aborts on exit after writing its outputs: keep whatever was produced.
    console.warn(`rembg failed: ${(error as Error).message.split("\n")[0]}`);
  }
  await mkdir(outputDir, { recursive: true });
  const produced = await readdir(output);
  await Promise.all(produced.map((f) => rename(join(output, f), join(outputDir, f))));
  await rm(work, { recursive: true });
  return new Set(produced.map((f) => parse(f).name));
}

const TO_WEBP = `
import sys
from PIL import Image
out = sys.argv[1]
for path in sys.argv[2:]:
    name = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    Image.open(path).save(f"{out}/{name}.webp", "WEBP", quality=80, method=6)
`;

export async function toWebp(pngs: string[], outputDir: string): Promise<void> {
  if (pngs.length === 0) return;
  await mkdir(outputDir, { recursive: true });
  await promisify(execFile)(".venv-rembg/bin/python", ["-c", TO_WEBP, outputDir, ...pngs]);
}
