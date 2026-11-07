import { access, constants, readFile, stat } from "node:fs/promises";
import { hostname, setPriority } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseOptions } from "../options.ts";
import type { DataRoot } from "../publication/paths.ts";
import { reasonOf } from "../publication/publish.ts";
import { alertedRun } from "./alertedRun.ts";
import { NTFY_USER, type NtfyToken, checkToken, ntfyToken } from "./ntfy.ts";

const EXIT_USAGE = 2;
const EXIT_CONFIG = 78;
const LOWEST_PRIORITY = 19;
const STOPPING: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
const PIPELINE = join(import.meta.dirname, "..", "..");
const USAGE = `usage: node src/scheduled/main.ts check | run [pipeline options]
  check  exits 0 once NTFY_TOKEN is a token ntfy accepts for ${NTFY_USER} and the data root is writable
  run    runs the pipeline once, then sends its outcome to ntfy and exits with its code`;

function tokenOrNull(): NtfyToken | null {
  const token = ntfyToken(process.env.NTFY_TOKEN);
  if (token === null) console.error(`NTFY_TOKEN holds no ntfy token: without it no alert would go out. Run add-publisher.sh ${NTFY_USER} on the Mac, then deploy with og/deploy/deploy.sh.`);
  return token;
}

async function writableDirectory(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function check(): Promise<number> {
  const token = tokenOrNull();
  if (token === null) return EXIT_CONFIG;
  const root = parseOptions([], process.env).dataRoot;
  if (!(await writableDirectory(root))) {
    console.error(`The data root ${root} is not a directory this user (uid ${process.getuid?.() ?? "?"}) can write.`);
    return EXIT_CONFIG;
  }
  const verdict = await checkToken(token, fetch);
  if (verdict.kind === "refused") {
    console.error(`ntfy refuses NTFY_TOKEN: ${verdict.reason}`);
    return EXIT_CONFIG;
  }
  console.log(`Ready: data root ${root}, alerts to ntfy as ${NTFY_USER}.`);
  return 0;
}

function plannedRoot(args: string[]): DataRoot | null {
  try {
    const options = parseOptions(args, process.env);
    if (options.job === undefined) return options.dataRoot;
    console.error(`${options.job}: a single job publishes nothing; run it with npm run pipeline\n${USAGE}`);
  } catch (error) {
    console.error(`${reasonOf(error)}\n${USAGE}`);
  }
  return null;
}

async function run(args: string[]): Promise<number> {
  const token = tokenOrNull();
  if (token === null) return EXIT_CONFIG;
  const root = plannedRoot(args);
  if (root === null) return EXIT_USAGE;
  try {
    setPriority(LOWEST_PRIORITY);
  } catch (error) {
    console.error(`The run keeps its priority: ${reasonOf(error)}`);
  }
  return alertedRun({
    pipeline: { file: process.execPath, args: [join(PIPELINE, "src", "main.ts"), ...args], cwd: PIPELINE, env: process.env },
    root,
    token,
    ntfy: { fetcher: fetch, sleep: (ms) => sleep(ms), log: (line) => console.error(line) },
    memoryEvents: () => readFile("/sys/fs/cgroup/memory.events", "utf8").catch(() => null),
    host: hostname(),
    stops: {
      subscribe: (stop) => {
        for (const signal of STOPPING) process.on(signal, stop);
        return () => {
          for (const signal of STOPPING) process.off(signal, stop);
        };
      },
    },
    echo: (chunk) => process.stderr.write(chunk),
    now: () => new Date(),
  });
}

const [command, ...args] = process.argv.slice(2);
if (command === "check") process.exitCode = await check();
else if (command === "run") process.exitCode = await run(args);
else {
  console.error(USAGE);
  process.exitCode = EXIT_USAGE;
}
