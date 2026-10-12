import type { ChosenVote } from "../panel/rows.ts"
import { sentenceText, summary } from "../panel/summary.ts"
import type { Param } from "../param.ts"
import type { View } from "../view/view.ts"
import { embedUrl } from "./chrome.ts"

const SITE = "La cour des grands"
// A fixed height rather than a ratio: the legend under the chart keeps its height in pixels and wraps onto more lines as the column narrows, so a ratio would leave the chart little room on a phone.
const HEIGHT_PX = 480

export function embedTitle(view: View, chosen: ChosenVote | null): string {
  return [SITE, ...summary(view, chosen).map(sentenceText)].join(" · ")
}

export function embedCode(page: string, view: readonly Param[], title: string): string {
  const attributes: readonly (readonly [name: string, value: string])[] = [
    ["src", embedUrl(page, view)],
    ["title", title],
    ["loading", "lazy"],
    ["style", `width: 100%; height: ${HEIGHT_PX}px; border: 0`],
  ]
  return `<iframe ${attributes.map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(" ")}></iframe>`
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}
