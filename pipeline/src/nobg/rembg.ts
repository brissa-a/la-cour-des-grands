import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

export const MODEL = "bria-rmbg";
export type Model = typeof MODEL;

const REMBG = ".venv-rembg/bin/rembg";

export async function removeBackgrounds(photos: string[], outputDir: string): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), "lcdg-rembg-"));
  const input = join(work, "input");
  const output = join(work, "output");
  await mkdir(input);
  await mkdir(output);
  await Promise.all(photos.map((p) => copyFile(p, join(input, basename(p)))));
  await promisify(execFile)(REMBG, ["p", "-m", MODEL, input, output], {
    env: { ...process.env, U2NET_HOME: resolve("cache/models") },
    maxBuffer: 64 * 1024 * 1024,
  });
  await mkdir(outputDir, { recursive: true });
  const produced = await readdir(output);
  await Promise.all(produced.map((f) => rename(join(output, f), join(outputDir, f))));
  await rm(work, { recursive: true });
}
