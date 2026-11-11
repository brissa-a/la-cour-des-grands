import assert from "node:assert/strict";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { after, test } from "node:test";
import { type Fetch, MAX_BODY_BYTES, NTFY_SERVER, type Notification, type NtfyToken, RETRY_DELAYS_MS, checkToken, clipped, ntfyToken, publish } from "./ntfy.ts";

const TOKEN_TEXT = "tk_0123456789abcdefghij-_ABCDEFG";

function token(): NtfyToken {
  const parsed = ntfyToken(TOKEN_TEXT);
  assert.ok(parsed !== null);
  return parsed;
}

const NOTIFICATION: Notification = {
  topic: "rejected",
  priority: 4,
  title: "Données refusées: 2 garde-fous",
  body: "Candidate 6a64dfbf… set aside:\n- 1 votes against 2 in the current version",
  tags: ["no_entry", "warning"],
};

type Received = { readonly method: string | undefined; readonly path: string; readonly authorization: string | undefined; readonly body: string };

const received: Received[] = [];
const server = createServer((request, response) => {
  void text(request).then((body) => {
    received.push({ method: request.method, path: request.url ?? "", authorization: request.headers.authorization, body });
    response.end("{}");
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
after(() => server.close());
const address = server.address();
assert.ok(address !== null && typeof address === "object");
const local = `http://127.0.0.1:${address.port}`;
const toLocal: Fetch = (url, init) => fetch(url.replace(NTFY_SERVER, local), init);

function quiet(log: string[] = [], slept: number[] = []) {
  return {
    sleep: (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    },
    log: (line: string) => log.push(line),
  };
}

test("an ntfy token is the tk_ token ntfy hands out, as the token file holds it; nothing else is", () => {
  assert.equal(ntfyToken(TOKEN_TEXT), TOKEN_TEXT);
  assert.equal(ntfyToken(`${TOKEN_TEXT}\n`), TOKEN_TEXT);
  for (const value of [undefined, "", " ", "tk_", TOKEN_TEXT.slice(0, -1), `${TOKEN_TEXT}x`, `tx${TOKEN_TEXT.slice(2)}`, `${TOKEN_TEXT.slice(0, -1)}!`, `Bearer ${TOKEN_TEXT}`, "correct horse battery staple"])
    assert.equal(ntfyToken(value), null, String(value));
});

test("a notification is POSTed to its topic of the app, with its title, priority and tags in the query, the token as bearer and the body as UTF-8", async () => {
  received.length = 0;
  assert.equal(await publish(NOTIFICATION, token(), { fetcher: toLocal, ...quiet() }), true);
  assert.equal(received.length, 1);
  const [request] = received;
  assert.ok(request !== undefined);
  const url = new URL(request.path, local);
  assert.deepEqual(
    [request.method, url.pathname, url.searchParams.get("title"), url.searchParams.get("priority"), url.searchParams.get("tags"), request.authorization, request.body],
    ["POST", "/lcdg_pipeline-rejected", NOTIFICATION.title, "4", "no_entry,warning", `Bearer ${TOKEN_TEXT}`, NOTIFICATION.body],
  );
  assert.ok(/^[\x21-\x7e]+$/.test(request.path), request.path);
});

test("a body past ntfy's message size is cut to it on a character boundary, with a mark", async () => {
  received.length = 0;
  const long = "€".repeat(MAX_BODY_BYTES);
  await publish({ ...NOTIFICATION, body: long }, token(), { fetcher: toLocal, ...quiet() });
  const sent = received[0]?.body ?? "";
  assert.ok(Buffer.byteLength(sent) <= MAX_BODY_BYTES, String(Buffer.byteLength(sent)));
  assert.ok(sent.endsWith("\n[…]") && sent.slice(0, -4) === "€".repeat(sent.length - 4), sent.slice(-10));
  assert.ok(Buffer.byteLength(sent) > MAX_BODY_BYTES - 9);
  assert.equal(clipped("short"), "short");
  assert.equal(clipped("x".repeat(MAX_BODY_BYTES)), "x".repeat(MAX_BODY_BYTES));
  assert.equal(clipped("abcdefghij", 10), "abcdefghij");
  assert.equal(clipped("abcdefghijk", 10), "abcd\n[…]");
  assert.equal(clipped("\uFFFDabcdefgh", 10), "\uFFFDa\n[…]");
});

function answering(...outcomes: (number | Error)[]): { readonly fetcher: Fetch; readonly calls: () => number } {
  let calls = 0;
  return {
    fetcher: () => {
      const outcome = outcomes[calls++] ?? 200;
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(new Response("{}", { status: outcome }));
    },
    calls: () => calls,
  };
}

test("a server or network failure is tried again after 10 s then 60 s; a refused token or topic is not; the log never shows the token", async () => {
  const log: string[] = [];
  const slept: number[] = [];
  const recovering = answering(500, new Error("fetch failed"), 200);
  assert.equal(await publish(NOTIFICATION, token(), { fetcher: recovering.fetcher, ...quiet(log, slept) }), true);
  assert.deepEqual([recovering.calls(), slept], [3, [...RETRY_DELAYS_MS]]);
  assert.deepEqual(log, [
    "ntfy lcdg_pipeline-rejected, priority 4: Données refusées: 2 garde-fous",
    "ntfy did not take the notification to lcdg_pipeline-rejected: HTTP 500, trying again in 10 s",
    "ntfy did not take the notification to lcdg_pipeline-rejected: fetch failed, trying again in 60 s",
  ]);

  slept.length = 0;
  const down = answering(503, 429, new Error("ECONNREFUSED"));
  assert.equal(await publish(NOTIFICATION, token(), { fetcher: down.fetcher, ...quiet(log, slept) }), false);
  assert.deepEqual([down.calls(), slept], [3, [...RETRY_DELAYS_MS]]);
  assert.match(log.at(-1) ?? "", /lcdg_pipeline-rejected: ECONNREFUSED, given up after 3 attempts/);

  slept.length = 0;
  for (const status of [400, 401, 403, 413]) {
    const refused = answering(status);
    assert.equal(await publish(NOTIFICATION, token(), { fetcher: refused.fetcher, ...quiet(log, slept) }), false);
    assert.deepEqual([refused.calls(), slept], [1, []]);
    assert.match(log.at(-1) ?? "", new RegExp(`refused the notification to lcdg_pipeline-rejected: HTTP ${status}$`));
  }
  assert.ok(log.length > 0 && log.every((line) => !line.includes(TOKEN_TEXT)));
});

function account(status: number, body: string): Fetch {
  return (url, init) => {
    assert.equal(url, "https://ntfy.kxv.fr/v1/account");
    assert.deepEqual(init.headers, { authorization: `Bearer ${TOKEN_TEXT}` });
    return Promise.resolve(new Response(body, { status }));
  };
}

test("a token is accepted only when ntfy knows it as the app's user", async () => {
  assert.deepEqual(await checkToken(token(), account(200, '{"username":"lcdg_pipeline","role":"user"}')), { kind: "accepted" });
  assert.deepEqual(await checkToken(token(), account(200, '{"username":"alexis","role":"admin"}')), { kind: "refused", reason: 'the token belongs to "alexis", not to lcdg_pipeline' });
  assert.deepEqual(await checkToken(token(), account(200, "<html>")), { kind: "refused", reason: "the token belongs to null, not to lcdg_pipeline" });
  assert.deepEqual(await checkToken(token(), account(401, '{"code":40101}')), { kind: "refused", reason: "https://ntfy.kxv.fr/v1/account answered HTTP 401" });
  assert.deepEqual(await checkToken(token(), () => Promise.reject(new Error("getaddrinfo ENOTFOUND ntfy.kxv.fr"))), {
    kind: "refused",
    reason: "https://ntfy.kxv.fr is unreachable: getaddrinfo ENOTFOUND ntfy.kxv.fr",
  });
});
