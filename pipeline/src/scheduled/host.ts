import { fieldOf, parseJson } from "../core/json.ts";

export type LockHolder = { readonly pid: number; readonly host: string; readonly since: string };

// The content lock.ts writes: who holds the run lock, read back by another process.
export function lockHolder(content: string): LockHolder | null {
  let holder: unknown;
  try {
    holder = parseJson(content);
  } catch {
    return null;
  }
  const pid = fieldOf(holder, "pid");
  const host = fieldOf(holder, "host");
  const since = fieldOf(holder, "since");
  return typeof pid === "number" && Number.isSafeInteger(pid) && typeof host === "string" && typeof since === "string" ? { pid, host, since } : null;
}

const OOM_KILL = /^oom_kill (\d+)$/m;

// cgroup v2's memory.events: oom_kill counts the processes the kernel killed for reaching the memory limit.
export function oomKills(memoryEvents: string): number | null {
  const count = OOM_KILL.exec(memoryEvents)?.[1];
  return count === undefined ? null : Number(count);
}
