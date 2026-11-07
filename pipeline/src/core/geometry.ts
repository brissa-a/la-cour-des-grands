export type Position = readonly [lon: number, lat: number];
export type Ring = readonly Position[];
export type Polygon = { readonly outer: Ring; readonly holes: readonly Ring[] };
export type BBox = readonly [west: number, south: number, east: number, north: number];

const METERS_PER_DEGREE = 111_320;
const RADIANS_PER_DEGREE = Math.PI / 180;

const samePosition = (a: Position, b: Position): boolean => a[0] === b[0] && a[1] === b[1];

function endsWith(points: readonly Position[], position: Position): boolean {
  const last = points.at(-1);
  return last !== undefined && samePosition(last, position);
}

export function ringArea(ring: Ring): number {
  let twice = 0;
  let previous: Position | undefined;
  for (const current of ring) {
    if (previous !== undefined) twice += previous[0] * current[1] - current[0] * previous[1];
    previous = current;
  }
  return twice / 2;
}

export function ringContains(ring: Ring, [x, y]: Position): boolean {
  const last = ring.at(-1);
  if (last === undefined) return false;
  let inside = false;
  let [xj, yj] = last;
  for (const [xi, yi] of ring) {
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    xj = xi;
    yj = yi;
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
      let previous: Position | undefined;
      for (const current of ring) {
        if (previous !== undefined) {
          const ax = (previous[0] - px) * xScale;
          const ay = (previous[1] - py) * METERS_PER_DEGREE;
          const dx = (current[0] - px) * xScale - ax;
          const dy = (current[1] - py) * METERS_PER_DEGREE - ay;
          const length2 = dx * dx + dy * dy;
          const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
          best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
        }
        previous = current;
      }
    }
  }
  return best;
}

type Outer = { readonly outer: Ring; readonly area: number; readonly holes: Ring[] };

export function polygonsFromShapefileRings(rings: readonly Ring[]): Polygon[] {
  const outers = rings.filter((r) => ringArea(r) < 0).map((outer): Outer => ({ outer, area: -ringArea(outer), holes: [] }));
  const orphans: Ring[] = [];
  for (const hole of rings.filter((r) => ringArea(r) >= 0)) {
    const [start] = hole;
    const owner =
      start === undefined
        ? undefined
        : outers
            .filter((o) => ringContains(o.outer, start))
            .reduce<Outer | undefined>((smallest, o) => (smallest === undefined || o.area < smallest.area ? o : smallest), undefined);
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

function closed(open: readonly Position[]): Ring | null {
  const [first] = open;
  return open.length < 3 || first === undefined ? null : [...open, first];
}

export function clipRing(ring: Ring, box: BBox): Ring | null {
  let points = ring.slice(0, -1);
  for (const { inside, cut } of boxEdges(box)) {
    let previous = points.at(-1);
    if (previous === undefined) return null;
    const kept: Position[] = [];
    for (const current of points) {
      if (inside(current)) {
        if (!inside(previous)) kept.push(cut(previous, current));
        kept.push(current);
      } else if (inside(previous)) kept.push(cut(previous, current));
      previous = current;
    }
    points = kept;
  }
  return closed(points);
}

type Vertex = { readonly position: Position; readonly x: number; readonly y: number; kept: boolean };
type Stretch = { readonly start: Vertex; readonly inner: readonly Vertex[]; readonly end: Vertex };

export function simplifyRing(ring: Ring, toleranceMeters: number): Ring {
  const [first] = ring;
  if (ring.length < 4 || first === undefined) return ring;
  const xScale = Math.cos(first[1] * RADIANS_PER_DEGREE) * METERS_PER_DEGREE;
  const vertices = ring.map((position): Vertex => ({ position, x: position[0] * xScale, y: position[1] * METERS_PER_DEGREE, kept: false }));
  const [head, ...inner] = vertices;
  const tail = inner.pop();
  if (head === undefined || tail === undefined) return ring;
  head.kept = true;
  tail.kept = true;
  const stack: Stretch[] = [{ start: head, inner, end: tail }];
  for (let stretch = stack.pop(); stretch !== undefined; stretch = stack.pop()) {
    const { start, end } = stretch;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length2 = dx * dx + dy * dy;
    let farthest = -1;
    let farthestDistance = -1;
    for (const [i, vertex] of stretch.inner.entries()) {
      const ex = vertex.x - start.x;
      const ey = vertex.y - start.y;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (ex * dx + ey * dy) / length2));
      const distance = Math.hypot(ex - t * dx, ey - t * dy);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = i;
      }
    }
    const kept = stretch.inner[farthest];
    if (kept !== undefined && farthestDistance > toleranceMeters) {
      kept.kept = true;
      stack.push({ start, inner: stretch.inner.slice(0, farthest), end: kept }, { start: kept, inner: stretch.inner.slice(farthest + 1), end });
    }
  }
  return vertices.filter((v) => v.kept).map((v) => v.position);
}

export function roundRing(ring: Ring, decimals: number): Ring | null {
  const scale = 10 ** decimals;
  const round = (v: number) => Math.round(v * scale) / scale;
  const points: Position[] = [];
  for (const [lon, lat] of ring.slice(0, -1)) {
    const p: Position = [round(lon), round(lat)];
    if (!endsWith(points, p)) points.push(p);
  }
  const [first] = points;
  while (points.length > 1 && first !== undefined && endsWith(points, first)) points.pop();
  return closed(points);
}

export const orientRing = (ring: Ring, counterClockwise: boolean): Ring =>
  ringArea(ring) > 0 === counterClockwise ? ring : ring.toReversed();
