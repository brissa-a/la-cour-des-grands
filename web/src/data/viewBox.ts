export type ViewBox = { readonly x: number; readonly y: number; readonly width: number; readonly height: number } & { readonly __brand: "ViewBox" }

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

export function parseViewBox(text: string): ViewBox | null {
  const fields = text.trim().split(/\s*,\s*|\s+/)
  if (!fields.every(field => NUMBER.test(field))) return null
  const [x = NaN, y = NaN, width = NaN, height = NaN, ...rest] = fields.map(Number)
  if (rest.length !== 0 || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the NUMBER test and the finite positive size above prove a box that a fit can divide by
  return { x, y, width, height } as ViewBox
}

export function viewBoxAttribute({ x, y, width, height }: ViewBox): string {
  return `${x} ${y} ${width} ${height}`
}
