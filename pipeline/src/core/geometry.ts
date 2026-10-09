export type Position = readonly [lon: number, lat: number];
export type Ring = readonly Position[];
export type Polygon = { readonly outer: Ring; readonly holes: readonly Ring[] };
export type BBox = readonly [west: number, south: number, east: number, north: number];

const METERS_PER_DEGREE = 111_320;
const RADIANS_PER_DEGREE = Math.PI / 180;

export function ringArea(ring: Ring): number {
  let twice = 0;
  for (let i = 1; i < ring.length; i++) {
    const [x0, y0] = ring[i - 1]!;
    const [x1, y1] = ring[i]!;
    twice += x0 * y1 - x1 * y0;
  }
  return twice / 2;
}

export function ringContains(ring: Ring, [x, y]: Position): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const containsPoint = (polygons: readonly Polygon[], p: Position): boolean =>
  polygons.some((polygon) => ringContains(polygon.outer, p) && !polygon.holes.some((hole) => ringContains(hole, p)));

export function distanceMeters(polygons: readonly Polygon[], p: Position): number {
  if (containsPoint(polygons, p)) return 0;
  const [px, py] = p;
  const xScale = Math.cos(py * RADIANS_PER_DEGREE) * METERS_PER_DEGREE;
  let best = Infinity;
  for (const polygon of polygons) {
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let i = 1; i < ring.length; i++) {
        const ax = (ring[i - 1]![0] - px) * xScale;
        const ay = (ring[i - 1]![1] - py) * METERS_PER_DEGREE;
        const dx = (ring[i]![0] - px) * xScale - ax;
        const dy = (ring[i]![1] - py) * METERS_PER_DEGREE - ay;
        const length2 = dx * dx + dy * dy;
        const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
      }
    }
  }
  return best;
}

export function polygonsFromShapefileRings(rings: readonly Ring[]): Polygon[] {
  const outers = rings.filter((r) => ringArea(r) < 0).map((outer) => ({ outer, area: -ringArea(outer), holes: [] as Ring[] }));
  const orphans: Ring[] = [];
  for (const hole of rings.filter((r) => ringArea(r) >= 0)) {
    const owner = outers
      .filter((o) => ringContains(o.outer, hole[0]!))
      .reduce<(typeof outers)[number] | undefined>((smallest, o) => (smallest === undefined || o.area < smallest.area ? o : smallest), undefined);
    if (owner === undefined) orphans.push(hole);
    else owner.holes.push(hole);
  }
  return [...outers.map(({ outer, holes }) => ({ outer, holes })), ...orphans.map((outer) => ({ outer, holes: [] }))];
}

export function padBox([west, south, east, north]: BBox, meters: number): BBox {
  const dLat = meters / METERS_PER_DEGREE;
  const dLon = meters / (METERS_PER_DEGREE * Math.cos(((south + north) / 2) * RADIANS_PER_DEGREE));
  return [west - dLon, south - dLat, east + dLon, north + dLat];
}

type Edge = { inside: (p: Position) => boolean; cut: (a: Position, b: Position) => Position };

function boxEdges([west, south, east, north]: BBox): Edge[] {
  const atX = (x: number) => (a: Position, b: Position): Position => [x, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
  const atY = (y: number) => (a: Position, b: Position): Position => [a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), y];
  return [
    { inside: (p) => p[0] >= west, cut: atX(west) },
    { inside: (p) => p[0] <= east, cut: atX(east) },
    { inside: (p) => p[1] >= south, cut: atY(south) },
    { inside: (p) => p[1] <= north, cut: atY(north) },
  ];
}

const close = (open: readonly Position[]): Ring => [...open, open[0]!];

export function clipRing(ring: Ring, box: BBox): Ring | null {
  let points = ring.slice(0, -1);
  for (const { inside, cut } of boxEdges(box)) {
    const kept: Position[] = [];
    for (let i = 0; i < points.length; i++) {
      const current = points[i]!;
      const previous = points[(i + points.length - 1) % points.length]!;
      if (inside(current)) {
        if (!inside(previous)) kept.push(cut(previous, current));
        kept.push(current);
      } else if (inside(previous)) kept.push(cut(previous, current));
    }
    points = kept;
    if (points.length === 0) return null;
  }
  return points.length < 3 ? null : close(points);
}

export function simplifyRing(ring: Ring, toleranceMeters: number): Ring {
  if (ring.length < 4) return ring;
  const xScale = Math.cos(ring[0]![1] * RADIANS_PER_DEGREE) * METERS_PER_DEGREE;
  const x = ring.map((p) => p[0] * xScale);
  const y = ring.map((p) => p[1] * METERS_PER_DEGREE);
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const dx = x[b]! - x[a]!;
    const dy = y[b]! - y[a]!;
    const length2 = dx * dx + dy * dy;
    let farthest = -1;
    let farthestDistance = -1;
    for (let i = a + 1; i < b; i++) {
      const ex = x[i]! - x[a]!;
      const ey = y[i]! - y[a]!;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (ex * dx + ey * dy) / length2));
      const distance = Math.hypot(ex - t * dx, ey - t * dy);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = i;
      }
    }
    if (farthestDistance > toleranceMeters) {
      keep[farthest] = 1;
      stack.push([a, farthest], [farthest, b]);
    }
  }
  return ring.filter((_, i) => keep[i] === 1);
}

export function roundRing(ring: Ring, decimals: number): Ring | null {
  const scale = 10 ** decimals;
  const round = (v: number) => Math.round(v * scale) / scale;
  const points: Position[] = [];
  for (const [lon, lat] of ring.slice(0, -1)) {
    const p: Position = [round(lon), round(lat)];
    const last = points.at(-1);
    if (last === undefined || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
  }
  while (points.length > 1 && points.at(-1)![0] === points[0]![0] && points.at(-1)![1] === points[0]![1]) points.pop();
  return points.length < 3 ? null : close(points);
}

export const orientRing = (ring: Ring, counterClockwise: boolean): Ring =>
  ringArea(ring) > 0 === counterClockwise ? ring : ring.toReversed();
