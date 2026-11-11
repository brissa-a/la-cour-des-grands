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

const compose = readFileSync(new URL("../deploy/docker-compose.yml", import.meta.url), "utf8")
const label = (key: string) => new RegExp(`traefik\\.http\\.${key.replaceAll(".", "\\.")}=(.*)`).exec(compose)?.[1]
const routers = [...new Set([...compose.matchAll(/traefik\.http\.routers\.([^.]+)\./g)].map(([, name]) => name ?? ""))]
const rule = (router: string) => label(`routers.${router}.rule`) ?? assert.fail(`${router} has no rule`)

type Request = { readonly host: string; readonly path: string; readonly userAgent: string }

const MATCHERS: Readonly<Record<string, (request: Request, first: string, second: string) => boolean>> = {
  Host: ({ host }, name) => host === name,
  PathPrefix: ({ path }, prefix) => path.startsWith(prefix),
  HeaderRegexp: ({ userAgent }, header, pattern) => (header === "User-Agent" ? new RegExp(pattern).test(userAgent) : assert.fail(`a header this test does not send: ${header}`)),
}

const matches = (routerRule: string, request: Request) =>
  routerRule.split(" && ").every(term => {
    const [, not, name = "", values = ""] = /^(!?)(\w+)\((.*)\)$/.exec(term) ?? assert.fail(`a rule term this test cannot read: ${term}`)
    const [first = "", second = ""] = Array.from(values.matchAll(/`([^`]*)`/g), ([, value = ""]) => value)
    const matcher = MATCHERS[name] ?? assert.fail(`a matcher this test does not know: ${name}`)
    return matcher(request, first, second) !== (not === "!")
  })

// As Traefik v3 chooses: the highest priority among the routers whose rule matches, a router without one ranking by its rule's length.
function routerFor(request: Request): string {
  const priority = (router: string) => Number(label(`routers.${router}.priority`) ?? rule(router).length)
  const [chosen, next] = routers.filter(router => matches(rule(router), request)).sort((a, b) => priority(b) - priority(a))
  if (chosen === undefined) return assert.fail(`no router for ${JSON.stringify(request)}`)
  if (next !== undefined) assert.notEqual(priority(chosen), priority(next), `${chosen} or ${next}: Traefik's choice is left to chance`)
  return chosen
}

const rateLimits = (router: string) =>
  (label(`routers.${router}.middlewares`) ?? "").split(",").filter(middleware => Number(label(`middlewares.${middleware}.ratelimit.average`) ?? 0) > 0).join(",")

test("Traefik tells the link preview robots by the service's very pattern, on every host whose pages it limits", () => {
  const limitedHosts = routers.filter(router => label(`routers.${router}.middlewares`)?.split(",").includes("lcdg-ratelimit")).map(rule)
  const crawlers = routers.flatMap(router => {
    const [, host, pattern] = /^(Host\(`[^`]*`\)) && HeaderRegexp\(`User-Agent`, `([^`]*)`\)/.exec(rule(router)) ?? []
    return host === undefined ? [] : [{ host, pattern }]
  })
  assert.deepEqual(new Set(crawlers.map(({ host }) => host)), new Set(limitedHosts))
  assert.equal(crawlers.length, limitedHosts.length)
  for (const { pattern } of crawlers) assert.equal(pattern, LINK_PREVIEW_AGENT_PATTERN)
})

test("Traefik rate-limits every request to the site whatever its User-Agent: pages, images and data each by their own limit, a link preview robot's pages and images by another, its data as a browser's", () => {
  const browser = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
  const robot = "Twitterbot/1.0"
  const [page, image, data] = ["/", "/og/0123456789abcdef0123456789abcdef01234567/c0da0f04899d/e3b0c442.jpg", "/data/v2/current.json"] as const
  const limit = (path: string, userAgent: string) => rateLimits(routerFor({ host: "cour-des-grands.fr", path, userAgent }))
  const limits = { page: limit(page, browser), image: limit(image, browser), data: limit(data, browser), robots: limit(page, robot) }
  for (const [requests, middlewares] of Object.entries(limits)) assert.notEqual(middlewares, "", requests)
  assert.equal(new Set(Object.values(limits)).size, 4, JSON.stringify(limits))
  assert.equal(limit(image, robot), limits.robots)
  assert.equal(limit(data, robot), limits.data)
})
