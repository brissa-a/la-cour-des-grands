export type ReadText = (path: string) => Promise<string>

const DATA_BRANCH = "test-v2"

export const PUBLISHED_ROOT = `https://raw.githubusercontent.com/brissa-a/lcdg-data/${DATA_BRANCH}/v2/`

export function fetchUnder(root: string, fetcher: (url: string) => Promise<Response> = fetch): ReadText {
  return async path => {
    const response = await fetcher(root + path)
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
    return response.text()
  }
}
