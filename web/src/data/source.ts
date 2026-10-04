const DATA_BRANCH = "test-v2"

const DATA_ROOT = `https://raw.githubusercontent.com/brissa-a/lcdg-data/${DATA_BRANCH}/v2/`

export async function fetchText(path: string): Promise<string> {
  const response = await fetch(DATA_ROOT + path)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.text()
}
