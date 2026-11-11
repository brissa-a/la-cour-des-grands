import { spawn } from "node:child_process";
import type { Exit } from "./report.ts";

export type Supervised = { readonly exit: Exit; readonly pid: number | null; readonly stderr: string };

export type Command = {
  readonly file: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
};

export type Stops = { readonly subscribe: (stop: (signal: NodeJS.Signals) => void) => () => void };

// Enough for the tail an alert shows, whatever the pipeline prints before it.
const KEPT_STDERR_BYTES = 16 * 1024;

export function supervise({ file, args, cwd, env }: Command, stops: Stops, echo: (chunk: Buffer) => void): Promise<Supervised> {
  return new Promise((resolve) => {
    let kept = Buffer.alloc(0);
    const child = spawn(file, args, { cwd, env, stdio: ["ignore", "inherit", "pipe"] });
    const unsubscribe = stops.subscribe((signal) => child.kill(signal));
    const settle = (exit: Exit) => {
      unsubscribe();
      resolve({ exit, pid: child.pid ?? null, stderr: kept.toString("utf8") });
    };
    child.stderr.on("data", (chunk: Buffer) => {
      echo(chunk);
      kept = Buffer.concat([kept, chunk]).subarray(-KEPT_STDERR_BYTES);
    });
    child.once("error", (error) => settle({ kind: "unstarted", reason: error.message }));
    child.once("close", (code, signal) => settle(signal === null ? { kind: "code", code: code ?? 1 } : { kind: "signal", signal }));
  });
}
