import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { download } from "../core/download.ts";

export const MODEL = "bria-rmbg";
export type Model = typeof MODEL;

export const briaModel = download({
  name: "bria-rmbg-2.0.onnx",
  url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/bria-rmbg-2.0.onnx",
  sha256: "5b486f08200f513f460da46dd701db5fbb47d79b4be4b708a19444bcd4e79958",
});

const INPUT_SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;
const QUIET = 3;

export type BackgroundRemover = (jpeg: string) => Promise<Buffer>;

export async function backgroundRemover(modelPath: string): Promise<BackgroundRemover> {
  const session = await ort.InferenceSession.create(modelPath, { logSeverityLevel: QUIET });
  return async (jpeg) => {
    const { data: original, info } = await sharp(jpeg).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const rgb = { raw: { width, height, channels: 3 } } as const;
    const pixels = await sharp(original, rgb).resize(INPUT_SIZE, INPUT_SIZE, { fit: "fill" }).raw().toBuffer();

    // Same preprocessing as rembg: scale by the brightest channel value, not by 255.
    const brightest = Math.max(pixels.reduce((max, v) => Math.max(max, v), 0), 1e-6);
    const area = INPUT_SIZE * INPUT_SIZE;
    const input = new Float32Array(3 * area);
    for (let i = 0; i < area; i++) {
      for (let c = 0; c < 3; c++) {
        input[c * area + i] = (pixels[i * 3 + c]! / brightest - MEAN[c]!) / STD[c]!;
      }
    }
    const outputs = await session.run({ pixel_values: new ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]) });
    const prediction = outputs["alphas"]!.data as Float32Array;

    let min = Infinity;
    let max = -Infinity;
    for (const v of prediction) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const mask = Uint8Array.from(prediction, (v) => Math.trunc(((v - min) / (max - min)) * 255));
    const alpha = await sharp(mask, { raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 } })
      .resize(width, height, { fit: "fill" })
      .extractChannel(0)
      .raw()
      .toBuffer();

    return sharp(original, rgb).joinChannel(alpha, { raw: { width, height, channels: 1 } }).webp({ quality: 80, effort: 6 }).toBuffer();
  };
}
