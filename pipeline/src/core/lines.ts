import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function* lines(path: string): AsyncGenerator<string> {
  const input = createReadStream(path, { encoding: "utf8", highWaterMark: 1 << 20 });
  yield* createInterface({ input, crlfDelay: Infinity });
}
