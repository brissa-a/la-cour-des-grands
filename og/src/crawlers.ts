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

const LINK_PREVIEW_AGENT = new RegExp(LINK_PREVIEW_AGENTS.join("|"))

export function isLinkPreviewCrawler(userAgent: string | undefined): boolean {
  return LINK_PREVIEW_AGENT.test(userAgent ?? "")
}
