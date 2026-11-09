// deploy.sh sends this to the scheduler's container on stdin, its image having neither ps nor kill: SIGTERM to the wrapper of a run in
// progress, `node src/scheduled/main.ts run`, which ends the run in seconds and alerts. The argument is the proc root, /proc by default.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const proc = process.argv[2] ?? "/proc"

function commandLine(pid: string): readonly string[] {
  try {
    return readFileSync(join(proc, pid, "cmdline"), "utf8").split("\0")
  } catch {
    return []
  }
}

for (const pid of readdirSync(proc).filter(name => /^[0-9]+$/.test(name))) {
  const args = commandLine(pid)
  if (!args.some((arg, index) => arg === "src/scheduled/main.ts" && args[index + 1] === "run")) continue
  try {
    process.kill(Number(pid), "SIGTERM")
    console.log(`Stopped the pipeline run in progress (${args.join(" ").trim()}): an alert follows; run it again once deployed.`)
  } catch (error) {
    // Ended between the listing and the signal.
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error
  }
}
