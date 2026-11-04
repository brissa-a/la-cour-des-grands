export type ReadText = (path: string) => Promise<string>

export const DATA_REPOSITORY = "brissa-a/lcdg-data"

export const DATA_BRANCH = "test-v2"

export function dataRootAt(ref: string): string {
  return `https://raw.githubusercontent.com/${DATA_REPOSITORY}/${ref}/v2/`
}

export const PUBLISHED_ROOT = dataRootAt(DATA_BRANCH)

export function fetchUnder(root: string, fetcher: (url: string) => Promise<Response> = fetch): ReadText {
  return async path => {
    const response = await fetcher(root + path)
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
    return response.text()
  }
}
