import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { getPriority } from "node:os";
import { text } from "node:stream/consumers";
import { setTimeout as sleep } from "node:timers/promises";
import { after, test } from "node:test";
import { temporaryRoot } from "../publication/snapshots.fixture.ts";

const MAIN = new URL("main.ts", import.meta.url).pathname;
const WIRING = new URL("wiring.fixture.ts", import.meta.url).pathname;
const TOKEN = "tk_0123456789abcdefghij-_ABCDEFG";
const KEY = "sk-ant-api03-0123456789abcdefghijABCDEFGHIJ_-xyz";

function start(args: readonly string[], env: Readonly<Record<string, string>>) {
  const { NTFY_TOKEN: _, LCDG_DATA_ROOT: __, ANTHROPIC_API_KEY: ___, ANTHROPIC_BASE_URL: ____, ANTHROPIC_AUTH_TOKEN: _____, ...inherited } = process.env;
  const child = spawn(process.execPath, [MAIN, ...args], { env: { ...inherited, ...env }, stdio: ["ignore", "pipe", "pipe"], signal: AbortSignal.timeout(30_000) });
  child.on("error", () => undefined);
  const ended = Promise.all([new Promise<number | null>((resolve) => child.on("close", resolve)), text(child.stdout), text(child.stderr)]).then(([code, stdout, stderr]) => ({
    code,
    stdout,
    stderr,
  }));
  return { child, ended };
}

const scheduled = (args: readonly string[], env: Readonly<Record<string, string>>) => start(args, env).ended;

type Received = { readonly path: string; readonly title: string | null; readonly authorization: string | null; readonly body: string };

async function localNtfy(answer: (request: IncomingMessage, response: ServerResponse) => void): Promise<{ readonly url: string; readonly received: Received[]; readonly close: () => void }> {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    void text(request).then((body) => {
      received.push({ path: url.pathname, title: url.searchParams.get("title"), authorization: request.headers.authorization ?? null, body });
      answer(request, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port for the local ntfy");
  return { url: `http://127.0.0.1:${address.port}`, received, close: () => server.close() };
}

test("without an ntfy token the scheduler refuses to start and a run refuses to begin, saying how to get one", async () => {
  const root = await temporaryRoot();
  for (const NTFY_TOKEN of [undefined, "", "not-a-token"]) {
    const env = { LCDG_DATA_ROOT: root, ...(NTFY_TOKEN === undefined ? {} : { NTFY_TOKEN }) };
    for (const args of [["check"], ["run"], ["run", "--skip-new-cutouts"]]) {
      const { code, stderr } = await scheduled(args, env);
      assert.equal(code, 78, `${args.join(" ")} with ${String(NTFY_TOKEN)}`);
      assert.match(stderr, /NTFY_TOKEN holds no ntfy token: without it no alert would go out\. Run add-publisher\.sh lcdg_pipeline/);
    }
  }
  assert.deepEqual(await readdir(root), []);
});

test("the scheduler refuses to start on a data root it cannot write, before asking ntfy anything", async () => {
  const root = `${await temporaryRoot()}/missing`;
  const { code, stderr } = await scheduled(["check"], { LCDG_DATA_ROOT: root, NTFY_TOKEN: TOKEN });
  assert.equal(code, 78);
  assert.match(stderr, new RegExp(`The data root ${root} is not a directory this user \\(uid \\d+\\) can write\\.`));
});

test("a run with a single job or an unknown option, or an unknown command, is refused before anything runs", async () => {
  const root = await temporaryRoot();
  for (const [args, message] of [
    [["run", "photos"], /photos: a single job publishes nothing/],
    [["run", "--branch", "main"], /Unknown option '--branch'/],
    [["publish"], /^usage: node src\/scheduled\/main\.ts check \| run/],
    [[], /^usage:/],
  ] as const) {
    const { code, stderr } = await scheduled(args, { LCDG_DATA_ROOT: root, NTFY_TOKEN: TOKEN });
    assert.equal(code, 2, args.join(" "));
    assert.match(stderr, message, args.join(" "));
  }
  assert.deepEqual(await readdir(root), []);
});

test("the scheduler starts only once the real ntfy client hears ntfy accept the token", async () => {
  const root = await temporaryRoot();
  for (const [status, body, code, output] of [
    [401, "", 78, /ntfy refuses NTFY_TOKEN: https:\/\/ntfy\.kxv\.fr\/v1\/account answered HTTP 401/],
    [200, JSON.stringify({ username: "lcdg_pipeline" }), 0, new RegExp(`^Ready: data root ${root}, alerts to ntfy as lcdg_pipeline, news written without Claude, no ANTHROPIC_API_KEY\\.`)],
  ] as const) {
    const ntfy = await localNtfy((_, response) => {
      response.writeHead(status, { "content-type": "application/json" }).end(body);
    });
    const run = await scheduled(["check"], { LCDG_DATA_ROOT: root, NTFY_TOKEN: TOKEN, NODE_OPTIONS: `--import ${WIRING}`, LOCAL_NTFY: ntfy.url });
    ntfy.close();
    assert.equal(run.code, code, run.stderr);
    assert.match(code === 0 ? run.stdout : run.stderr, output);
    assert.deepEqual(ntfy.received, [{ path: "/v1/account", title: null, authorization: `Bearer ${TOKEN}`, body: "" }]);
  }
});

test("a scheduled run starts the pipeline at the lowest priority, passes it SIGTERM, frees its lock and sends its end to ntfy", async () => {
  const root = await temporaryRoot();
  await mkdir(`${root}/v2/.runs`, { recursive: true });
  const earlier = { startedAt: "2026-11-06T03:30:00.000Z", status: "failed", error: "boom" };
  await writeFile(`${root}/v2/.runs/last.json`, JSON.stringify(earlier));
  const ntfy = await localNtfy((_, response) => {
    response.end("{}");
  });
  const started = `${root}/started`;
  const { child, ended } = start(["run"], { LCDG_DATA_ROOT: root, NTFY_TOKEN: TOKEN, NODE_OPTIONS: `--import ${WIRING}`, LOCAL_NTFY: ntfy.url, PIPELINE_STARTED: started });
  // A failed assertion must not leave the run and its waiting pipeline behind.
  after(() => child.kill("SIGTERM"));
  const deadline = performance.now() + 20_000;
  let pipeline = await readFile(started, "utf8").catch(() => null);
  while (pipeline === null && performance.now() < deadline) {
    await sleep(20);
    pipeline = await readFile(started, "utf8").catch(() => null);
  }
  assert.ok(pipeline !== null, "the pipeline started");
  assert.equal(getPriority(Number(pipeline)), 19);
  child.kill("SIGTERM");
  const run = await ended;
  ntfy.close();
  assert.equal(run.code, 143, run.stderr);
  assert.match(run.stderr, /the pipeline started\n/);
  assert.deepEqual(
    ntfy.received.map(({ path, title }) => ({ path, title })),
    [{ path: "/lcdg_pipeline-failed", title: "Run killed by SIGTERM" }],
  );
  assert.match(ntfy.received[0]?.body ?? "", /It recorded no run: .+ is from an earlier run, started 2026-11-06T03:30:00\.000Z\.\nIts lock .+\/v2\/\.lock, held by no process any more, was released/);
  assert.deepEqual(await readdir(`${root}/v2`), [".runs"]);
});

test("a scheduled run that publishes over a previous version has the real Claude client write the news with the key it was given, then sends it to ntfy", async () => {
  const root = await temporaryRoot();
  const ntfy = await localNtfy((_, response) => {
    response.end("{}");
  });
  const anthropic = await localNtfy((_, response) => {
    const message = { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "L'article 2 est adopté." }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } };
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(message));
  });
  const previous = "0123456789abcdef0123456789abcdef01234567";
  const version = "6a64dfbf2449e4c8357bc0319b9fe0b747c577d9";
  const run = await scheduled(["run"], {
    LCDG_DATA_ROOT: root,
    NTFY_TOKEN: TOKEN,
    ANTHROPIC_API_KEY: ` ${KEY}\n`,
    NODE_OPTIONS: `--import ${WIRING}`,
    LOCAL_NTFY: ntfy.url,
    LOCAL_ANTHROPIC: anthropic.url,
    PIPELINE_PUBLISHES_OVER: `${previous} ${version}`,
  });
  ntfy.close();
  anthropic.close();
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(
    anthropic.received.map(({ path, authorization }) => ({ path, authorization })),
    [{ path: "/v1/messages", authorization: `Bearer ${KEY}` }],
  );
  assert.match(anthropic.received[0]?.body ?? "", /"model":"claude-sonnet-5-5"/);
  assert.deepEqual(
    ntfy.received.map(({ path, title }) => ({ path, title })),
    [
      { path: "/lcdg_pipeline-done", title: "Data published: 1 new votes" },
      { path: "/lcdg_pipeline-news", title: "Assemblée : 1 scrutin" },
    ],
  );
  assert.equal(ntfy.received[1]?.body, "L'article 2 est adopté.\n\n_Rédigé par Claude à partir des données de l'Assemblée._");
  assert.ok(!`${run.stdout}${run.stderr}`.includes(KEY));
});
