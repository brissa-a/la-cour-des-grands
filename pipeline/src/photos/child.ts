import { type ChildProcess, spawn } from "node:child_process";

export type Attempt = { readonly kind: "done" } | { readonly kind: "failed"; readonly reason: string };

export type ChildCommand = {
  readonly file: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
};

export type Children = {
  readonly run: (command: ChildCommand) => Promise<Attempt>;
  // Kills them all at once: the pipeline that exits on a signal must not leave a cutout running outside its lock.
  readonly stop: () => void;
};

const failed = (reason: string): Attempt => ({ kind: "failed", reason });

const lastLine = (output: string): string | undefined => output.trim().split("\n").at(-1) || undefined;

// A process of its own: when the kernel kills it for memory, the pipeline that started it lives on.
export function children(): Children {
  const started: ChildProcess[] = [];
  let stopped = false;
  const run = ({ file, args, timeoutMs }: ChildCommand): Promise<Attempt> =>
    new Promise((resolve) => {
      let stderr = "";
      let timedOut = false;
      const child = spawn(file, args, { stdio: ["ignore", "ignore", "pipe"] });
      started.push(child);
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      const settle = (attempt: Attempt) => {
        clearTimeout(timer);
        resolve(attempt);
      };
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", (error) => settle(failed(`could not start: ${error.message}`)));
      child.once("close", (code, signal) => {
        if (stopped) settle(failed("stopped with the pipeline"));
        else if (timedOut) settle(failed(`took more than ${timeoutMs / 1000} s, killed`));
        else if (signal === "SIGKILL") settle(failed("killed by SIGKILL, most likely for lack of memory"));
        else if (signal !== null) settle(failed(`killed by ${signal}`));
        else if (code === 0) settle({ kind: "done" });
        else settle(failed(lastLine(stderr) ?? `exited with ${code}`));
      });
    });
  return {
    run,
    stop: () => {
      stopped = true;
      for (const child of started) child.kill("SIGKILL");
    },
  };
}
