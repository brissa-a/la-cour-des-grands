import assert from "node:assert/strict";
import { test } from "node:test";
import { type Interruptible, endOnInterrupt } from "./interrupt.ts";

class Exited extends Error {}

test("a run interrupted by SIGINT or SIGTERM ends what it holds, then exits with 128 plus the signal's number", () => {
  const events: string[] = [];
  const listeners = new Map<string, () => void>();
  const host: Interruptible = {
    once: (signal, listener) => listeners.set(signal, listener),
    exit: (code) => {
      events.push(`exit ${code}`);
      throw new Exited();
    },
  };
  endOnInterrupt(host, () => events.push("ended"));
  assert.deepEqual([...listeners.keys()], ["SIGINT", "SIGTERM"]);
  assert.throws(() => listeners.get("SIGINT")?.(), Exited);
  assert.throws(() => listeners.get("SIGTERM")?.(), Exited);
  assert.deepEqual(events, ["ended", "exit 130", "ended", "exit 143"]);
});
