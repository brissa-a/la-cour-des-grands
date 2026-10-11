export type ViewBox = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

export function parseViewBox(text: string): ViewBox | null {
  const fields = text.trim().split(/\s*,\s*|\s+/)
  if (!fields.every(field => NUMBER.test(field))) return null
  const [x = NaN, y = NaN, width = NaN, height = NaN, ...rest] = fields.map(Number)
  return rest.length === 0 && [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0 ? { x, y, width, height } : null
}

export function viewBoxAttribute({ x, y, width, height }: ViewBox): string {
  return `${x} ${y} ${width} ${height}`
}
