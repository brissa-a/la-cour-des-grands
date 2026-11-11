import assert from "node:assert/strict";
import { test } from "node:test";
import { type SdkFetch, MODEL, anthropicKey, claudeWriter } from "./claude.ts";

const KEY = "sk-ant-api03-0123456789abcdefghijABCDEFGHIJ_-xyz";
const PROMPT = { system: "Tu écris une notification.", user: "Faits (JSON) :\n{}" };

function key() {
  const parsed = anthropicKey(KEY);
  assert.ok(parsed !== null);
  return parsed;
}

type Seen = { readonly url: string; readonly authorization: string | null; readonly body: string; readonly signal: AbortSignal };

function answering(answer: () => Response | Promise<Response>): { readonly fetch: SdkFetch; readonly seen: Seen[] } {
  const seen: Seen[] = [];
  const fetch: SdkFetch = async (input, init) => {
    const request = new Request(input, init);
    seen.push({ url: request.url, authorization: request.headers.get("authorization"), body: await request.text(), signal: request.signal });
    return answer();
  };
  return { fetch, seen };
}

const message = (content: readonly object[], stop_reason: string | null = "end_turn") =>
  Response.json({ id: "msg_1", type: "message", role: "assistant", model: MODEL, content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 20 } });

const never = new AbortController().signal;

test("an Anthropic key is read trimmed from its shape alone, so that an empty or stray value never stands for one", () => {
  assert.equal(anthropicKey(`  ${KEY}\n`), KEY);
  for (const text of [undefined, "", "   ", "sk-ant-", "sk-ant-short", `sk-proj-${KEY.slice(7)}`, `${KEY} extra`, `key=${KEY}`, "tk_0123456789abcdefghij-_ABCDEFG"]) {
    assert.equal(anthropicKey(text), null, String(text));
  }
});

test("Claude is asked once, with the system prompt and a single user message, the key only in its header", async () => {
  const { fetch, seen } = answering(() => message([{ type: "text", text: "**Texte**" }]));
  assert.equal(await claudeWriter(key(), fetch)(PROMPT, never), "**Texte**");
  assert.equal(seen.length, 1);
  const [request] = seen;
  assert.ok(request !== undefined);
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.authorization, `Bearer ${KEY}`);
  assert.ok(!request.body.includes(KEY));
  assert.deepEqual(JSON.parse(request.body), {
    model: "claude-sonnet-5-5",
    max_tokens: 8000,
    output_config: { effort: "medium" },
    system: PROMPT.system,
    messages: [{ role: "user", content: PROMPT.user }],
  });
});

test("the text of an answer is its text blocks joined, its thinking left out", async () => {
  const { fetch } = answering(() => message([{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: "Première partie. " }, { type: "text", text: "Seconde." }]));
  assert.equal(await claudeWriter(key(), fetch)(PROMPT, never), "Première partie. Seconde.");
});

test("an answer that Claude did not finish, cut by its token limit or a refusal, is an error, not a text", async () => {
  for (const stop of ["max_tokens", "refusal", null]) {
    const { fetch } = answering(() => message([{ type: "text", text: "Un début" }], stop));
    await assert.rejects(claudeWriter(key(), fetch)(PROMPT, never), new Error(`stopped on ${String(stop)}`));
  }
});

test("a refused key or a failed connection is an error tried once, whose reason never holds the key, even when the failure quotes it", async () => {
  const refused = answering(() => Response.json({ type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` } }, { status: 401 }));
  const error = await claudeWriter(key(), refused.fetch)(PROMPT, never).then(() => null, (failure: unknown) => failure);
  assert.ok(error instanceof Error);
  assert.match(error.message, /^401 .*invalid x-api-key \[ANTHROPIC_API_KEY\]/);
  assert.equal(refused.seen.length, 1);
  const overloaded = answering(() => Response.json({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, { status: 529 }));
  await assert.rejects(claudeWriter(key(), overloaded.fetch)(PROMPT, never), /Overloaded/);
  assert.equal(overloaded.seen.length, 1);
  const unreachable: SdkFetch = () => Promise.reject(new Error(`connect ECONNREFUSED with ${KEY}`));
  const failed = await claudeWriter(key(), unreachable)(PROMPT, never).then(() => null, (failure: unknown) => failure);
  assert.ok(failed instanceof Error);
  assert.doesNotMatch(failed.message, new RegExp(KEY));
});

test("aborting the request stops it where it waits", async () => {
  const signals: AbortSignal[] = [];
  const waiting: SdkFetch = (_, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal ?? assert.fail("a request without a signal");
      signals.push(signal);
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  const controller = new AbortController();
  const asked = claudeWriter(key(), waiting)(PROMPT, controller.signal);
  while (signals.length === 0) await new Promise((tick) => setImmediate(tick));
  controller.abort();
  await assert.rejects(asked);
  assert.deepEqual(signals.map((s) => s.aborted), [true]);
});
