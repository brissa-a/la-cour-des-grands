import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { isLinkPreviewCrawler, LINK_PREVIEW_AGENT_PATTERN } from "./crawlers.ts"

test("the link preview robots of the networks are recognised by their user agent, browsers and search engines are not", () => {
  for (const agent of [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "WhatsApp/2.23.20.0",
    "Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)",
    "http.rb/5.2.0 (Mastodon/4.3.2; +https://mastodon.social/)",
    "TelegramBot (like TwitterBot)",
  ])
    assert.equal(isLinkPreviewCrawler(agent), true, agent)
  for (const agent of [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "curl/8.7.1",
    "",
    undefined,
  ])
    assert.equal(isLinkPreviewCrawler(agent), false, agent)
})

test("Traefik spares from its rate limits exactly the robots the service recognises, on every host whose pages it limits", () => {
  const compose = readFileSync(new URL("../deploy/docker-compose.yml", import.meta.url), "utf8")
  const label = (router: string, key: string) => new RegExp(`routers\\.${router}\\.${key}=(.*)`).exec(compose)?.[1]
  const routers = [...new Set([...compose.matchAll(/traefik\.http\.routers\.([^.]+)\./g)].map(([, name]) => name ?? ""))]
  const limitedHosts = routers.filter(router => label(router, "middlewares")?.split(",").includes("lcdg-ratelimit")).map(router => label(router, "rule"))
  const crawlers = routers.flatMap(router => {
    const [, host, pattern] = /^(Host\(`[^`]*`\)) && HeaderRegexp\(`User-Agent`, `([^`]*)`\)$/.exec(label(router, "rule") ?? "") ?? []
    return host === undefined ? [] : [{ host, pattern }]
  })
  assert.deepEqual(new Set(crawlers.map(({ host }) => host)), new Set(limitedHosts))
  assert.equal(crawlers.length, limitedHosts.length)
  for (const { pattern } of crawlers) assert.equal(pattern, LINK_PREVIEW_AGENT_PATTERN)
})
