import type { EventEmitter } from "node:events";
import { access, constants, stat } from "node:fs/promises";
import { parseOptions } from "../options.ts";
import type { DataRoot } from "../publication/paths.ts";
import { reasonOf } from "../publication/publish.ts";
import { alertedRun } from "./alertedRun.ts";
import { type AnthropicKey, MODEL, type Writer, anthropicKey } from "./claude.ts";
import { type Fetch, NTFY_USER, type NtfyToken, checkToken, ntfyToken } from "./ntfy.ts";
import type { Stops } from "./supervise.ts";

export const EXIT_USAGE = 2;
export const EXIT_CONFIG = 78;
export const LOWEST_PRIORITY = 19;
export const MEMORY_EVENTS = "/sys/fs/cgroup/memory.events";
const STOPPING: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export const USAGE = `usage: node src/scheduled/main.ts check | run [pipeline options]
  check  exits 0 once NTFY_TOKEN is a token ntfy accepts for ${NTFY_USER} and the data root is writable
  run    runs the pipeline once, then sends its outcome to ntfy and exits with its code
ANTHROPIC_API_KEY, optional, lets Claude write the news; without it they are written automatically.`;

export type Signals = Pick<EventEmitter, "on" | "off">;

export type Host = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetcher: Fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly setPriority: (priority: number) => void;
  readonly readText: (path: string) => Promise<string>;
  readonly signals: Signals;
  readonly hostname: string;
  readonly uid: number | null;
  readonly pipeline: { readonly node: string; readonly entry: string; readonly cwd: string };
  readonly echo: (chunk: Buffer) => void;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly now: () => Date;
  readonly writerFor: (key: AnthropicKey) => Writer;
};

function tokenOrNull(host: Host): NtfyToken | null {
  const token = ntfyToken(host.env.NTFY_TOKEN);
  if (token === null) host.error(`NTFY_TOKEN holds no ntfy token: without it no alert would go out. Run add-publisher.sh ${NTFY_USER} on the Mac, then deploy with server/deploy/deploy.sh.`);
  return token;
}

function keyOrNull(host: Host): AnthropicKey | null {
  const raw = host.env.ANTHROPIC_API_KEY;
  const key = anthropicKey(raw);
  if (key === null && (raw ?? "").trim() !== "") host.error("ANTHROPIC_API_KEY holds no Anthropic API key: the news will be written without Claude.");
  return key;
}

export async function writableDirectory(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export function signalStops(signals: Signals): Stops {
  return {
    subscribe: (stop) => {
      for (const signal of STOPPING) signals.on(signal, stop);
      return () => {
        for (const signal of STOPPING) signals.off(signal, stop);
      };
    },
  };
}

export async function check(host: Host): Promise<number> {
  const token = tokenOrNull(host);
  if (token === null) return EXIT_CONFIG;
  const root = parseOptions([], host.env).dataRoot;
  if (!(await writableDirectory(root))) {
    host.error(`The data root ${root} is not a directory this user (uid ${host.uid ?? "?"}) can write.`);
    return EXIT_CONFIG;
  }
  const verdict = await checkToken(token, host.fetcher);
  if (verdict.kind === "refused") {
    host.error(`ntfy refuses NTFY_TOKEN: ${verdict.reason}`);
    return EXIT_CONFIG;
  }
  const news = keyOrNull(host) === null ? "news written without Claude, no ANTHROPIC_API_KEY" : `news written by ${MODEL}`;
  host.log(`Ready: data root ${root}, alerts to ntfy as ${NTFY_USER}, ${news}.`);
  return 0;
}

function plannedRoot(args: string[], host: Host): DataRoot | null {
  try {
    const options = parseOptions(args, host.env);
    if (options.job === undefined) return options.dataRoot;
    host.error(`${options.job}: a single job publishes nothing; run it with npm run pipeline\n${USAGE}`);
  } catch (error) {
    host.error(`${reasonOf(error)}\n${USAGE}`);
  }
  return null;
}

export async function run(args: string[], host: Host): Promise<number> {
  const token = tokenOrNull(host);
  if (token === null) return EXIT_CONFIG;
  const root = plannedRoot(args, host);
  if (root === null) return EXIT_USAGE;
  try {
    host.setPriority(LOWEST_PRIORITY);
  } catch (error) {
    host.error(`The run keeps its priority: ${reasonOf(error)}`);
  }
  const key = keyOrNull(host);
  return alertedRun({
    pipeline: { file: host.pipeline.node, args: [host.pipeline.entry, ...args], cwd: host.pipeline.cwd, env: host.env },
    root,
    token,
    ntfy: { fetcher: host.fetcher, sleep: host.sleep, log: host.error },
    writer: key === null ? null : host.writerFor(key),
    memoryEvents: () => host.readText(MEMORY_EVENTS).catch(() => null),
    host: host.hostname,
    stops: signalStops(host.signals),
    echo: host.echo,
    now: host.now,
  });
}

export async function scheduled(argv: readonly string[], host: Host): Promise<number> {
  const [command, ...args] = argv;
  if (command === "check") return check(host);
  if (command === "run") return run(args, host);
  host.error(USAGE);
  return EXIT_USAGE;
}
