import { readFile, unlink } from "node:fs/promises";
import { constants } from "node:os";
import { isMissing } from "../publication/files.ts";
import { type DataRoot, layout } from "../publication/paths.ts";
import { reasonOf } from "../publication/publish.ts";
import { type LockHolder, lockHolder, oomKills } from "./host.ts";
import { lastRun } from "./lastRun.ts";
import { type NtfyDeps, type NtfyToken, publish } from "./ntfy.ts";
import { type Exit, type RunRecord, notificationFor } from "./report.ts";
import { type Command, type Stops, supervise } from "./supervise.ts";

export type AlertedRunDeps = {
  readonly pipeline: Command;
  readonly root: DataRoot;
  readonly token: NtfyToken;
  readonly ntfy: NtfyDeps;
  readonly memoryEvents: () => Promise<string | null>;
  readonly host: string;
  readonly stops: Stops;
  readonly echo: (chunk: Buffer) => void;
  readonly now: () => Date;
};

async function freshRun(path: string, spawnedAt: Date): Promise<RunRecord> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    return { kind: "none", reason: isMissing(error) ? `no ${path}` : `${path} is unreadable: ${reasonOf(error)}` };
  }
  try {
    const run = lastRun(content, spawnedAt);
    if (run.status === "earlier") return { kind: "none", reason: `${path} is from an earlier run, started ${run.startedAt.toISOString()}` };
    return { kind: "fresh", run };
  } catch (error) {
    return { kind: "none", reason: `${path} is not a run summary: ${reasonOf(error)}` };
  }
}

async function oomCount(memoryEvents: () => Promise<string | null>): Promise<number | null> {
  const events = await memoryEvents();
  return events === null ? null : oomKills(events);
}

const described = (holder: LockHolder | null, content: string | null): string | null =>
  holder === null ? (content?.trim() ?? null) : `held by pid ${holder.pid} on ${holder.host} since ${holder.since}`;

export function exitCodeOf(exit: Exit): number {
  switch (exit.kind) {
    case "code":
      return exit.code;
    case "signal":
      return 128 + constants.signals[exit.signal];
    case "unstarted":
      return 1;
  }
}

// A lock naming the pipeline this run started, once that process is dead, is held by nobody: no other run can have taken it while it existed.
async function releasedIfOrphaned(holder: LockHolder | null, pid: number | null, host: string, lock: string): Promise<boolean> {
  if (holder === null || holder.pid !== pid || holder.host !== host) return false;
  return unlink(lock).then(
    () => true,
    () => false,
  );
}

// The pipeline never sees the token: nothing it prints or crashes with can carry it.
const withheld = (env: Command["env"]): Command["env"] => Object.fromEntries(Object.entries(env).filter(([name]) => name !== "NTFY_TOKEN"));

export async function alertedRun(deps: AlertedRunDeps): Promise<number> {
  const before = await oomCount(deps.memoryEvents);
  const spawnedAt = deps.now();
  const { exit, pid, stderr } = await supervise({ ...deps.pipeline, env: withheld(deps.pipeline.env) }, deps.stops, deps.echo);
  const after = await oomCount(deps.memoryEvents);
  const { runs, lock } = layout(deps.root);
  const record = await freshRun(`${runs}/last.json`, spawnedAt);
  const content = await readFile(lock, "utf8").catch(() => null);
  const holder = content === null ? null : lockHolder(content);
  const lockReleased = await releasedIfOrphaned(holder, pid, deps.host, lock);
  const outOfMemory = before !== null && after !== null && after > before;
  const notification = notificationFor({ exit, record, lockPath: lock, holder: described(holder, content), lockReleased, outOfMemory, stderr });
  await publish(notification, deps.token, deps.ntfy);
  return exitCodeOf(exit);
}
