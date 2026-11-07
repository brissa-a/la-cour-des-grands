import assert from "node:assert/strict";
import { test } from "node:test";
import { siteServesItsOwnData } from "./mirror.ts";

const answering = (body: string, status = 200) => {
  const asked: string[] = [];
  return {
    asked,
    fetcher: (url: string) => {
      asked.push(url);
      return Promise.resolve(new Response(body, { status }));
    },
  };
};

test("the site serves its own data once its /data/v2/current.json names a version", async () => {
  const site = answering('{"version":"6a64dfbf2449e4c8357bc0319b9fe0b747c577d9","publishedAt":"2026-11-07T04:00:00.000Z"}\n');
  assert.equal(await siteServesItsOwnData(site.fetcher), true);
  assert.deepEqual(site.asked, ["https://cour-des-grands.fr/data/v2/current.json"]);
});

test("a site that answers its data pointer with an error, a page or a pointer naming no version still reads the mirror", async () => {
  for (const [body, status] of [
    ["Page introuvable", 404],
    ["<!doctype html><title>La cour des grands</title>", 200],
    ['{"version":"6a64dfb","publishedAt":"2026-11-07T04:00:00.000Z"}', 200],
    ['{"version":"6a64dfbf2449e4c8357bc0319b9fe0b747c577d9","publishedAt":"2026-11-07T04:00:00.000Z"}', 503],
  ] as const)
    assert.equal(await siteServesItsOwnData(answering(body, status).fetcher), false, `${status} ${body}`);
});
