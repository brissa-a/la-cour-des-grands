import { constants } from "node:os";

export type Interruptible = {
  readonly once: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown;
  readonly exit: (code: number) => never;
};

export function endOnInterrupt(host: Interruptible, end: () => void): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    host.once(signal, () => {
      end();
      host.exit(128 + constants.signals[signal]);
    });
  }
}
