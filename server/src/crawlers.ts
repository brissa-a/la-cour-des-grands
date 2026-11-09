const LINK_PREVIEW_AGENTS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "Slack-ImgProxy",
  "Discordbot",
  "WhatsApp",
  "Cardyb",
  "Mastodon",
  "Pleroma",
  "Akkoma",
  "Misskey",
  "TelegramBot",
  "SkypeUriPreview",
  "redditbot",
  "Pinterestbot",
  "Embedly",
  "Iframely",
  "vkShare",
] as const

// Traefik's crawler router matches the same pattern, in og/deploy/docker-compose.yml.
export const LINK_PREVIEW_AGENT_PATTERN = LINK_PREVIEW_AGENTS.join("|")

const LINK_PREVIEW_AGENT = new RegExp(LINK_PREVIEW_AGENT_PATTERN)

export function isLinkPreviewCrawler(userAgent: string | undefined): boolean {
  return LINK_PREVIEW_AGENT.test(userAgent ?? "")
}
