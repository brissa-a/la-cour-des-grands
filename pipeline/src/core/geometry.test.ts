import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Polygon,
  type Ring,
  clipRing,
  containsPoint,
  distanceMeters,
  orientRing,
  polygonsFromShapefileRings,
  ringArea,
  roundRing,
  simplifyRing,
} from "./geometry.ts";

const square = (x0: number, y0: number, x1: number, y1: number): Ring => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

test("ringArea is positive counter-clockwise and orientRing reverses only misoriented rings", () => {
  const ccw = square(0, 0, 2, 1);
  const cw = ccw.toReversed();
  assert.equal(ringArea(ccw), 2);
  assert.equal(ringArea(cw), -2);
  assert.equal(orientRing(ccw, true), ccw);
  assert.equal(orientRing(cw, false), cw);
  assert.deepEqual(orientRing(cw, true), ccw);
  assert.deepEqual(orientRing(ccw, false), cw);
});

test("containsPoint excludes holes but accepts an island inside a hole", () => {
  const withHole: Polygon = { outer: square(0, 0, 10, 10), holes: [square(4, 4, 6, 6)] };
  const island: Polygon = { outer: square(4.5, 4.5, 5.5, 5.5), holes: [] };
  assert.equal(containsPoint([withHole], [2, 2]), true);
  assert.equal(containsPoint([withHole], [5, 5]), false);
  assert.equal(containsPoint([withHole], [11, 5]), false);
  assert.equal(containsPoint([withHole, island], [5, 5]), true);
});

test("distanceMeters is 0 inside and metric outside", () => {
  const polygons: Polygon[] = [{ outer: square(0, 44, 1, 46), holes: [] }];
  assert.equal(distanceMeters(polygons, [0.5, 45]), 0);
  const meters = distanceMeters(polygons, [1.001, 45]);
  assert.ok(Math.abs(meters - 78.7) < 0.5, `${meters}`);
});

test("shapefile rings: clockwise outers, holes go to the smallest outer containing them", () => {
  const big = square(0, 0, 10, 10).toReversed();
  const island = square(3, 3, 7, 7).toReversed();
  const lake = square(1, 1, 9, 9);
  const pond = square(4, 4, 5, 5);
  const polygons = polygonsFromShapefileRings([big, island, lake, pond]);
  assert.deepEqual(
    polygons.map((p) => p.holes),
    [[lake], [pond]],
  );
});

test("clipRing cuts rings to the box and drops those outside it", () => {
  const u: Ring = [
    [0, 0],
    [3, 0],
    [3, 3],
    [2, 3],
    [2, 1],
    [1, 1],
    [1, 3],
    [0, 3],
    [0, 0],
  ];
  const clipped = clipRing(u, [0.5, 0.5, 2.5, 2]);
  assert.notEqual(clipped, null);
  assert.equal(Math.abs(ringArea(clipped!)), 2 * 1.5 - 1 * 1);
  assert.deepEqual(clipped![0], clipped!.at(-1));
  assert.equal(clipRing(square(4, 4, 5, 5), [0, 0, 1, 1]), null);
  assert.ok(Math.abs(Math.abs(ringArea(clipRing(square(0.8, 0.8, 2, 2), [0, 0, 1, 1])!)) - 0.04) < 1e-12);
});

test("simplifyRing keeps vertices farther than the tolerance in meters and drops the others", () => {
  const north = (meters: number) => meters / 111_320;
  const east = (meters: number) => meters / (111_320 * Math.cos((45 * Math.PI) / 180));
  const ring: Ring = [
    [0, 45],
    [0.005, 45 - north(6)],
    [0.01, 45],
    [0.01 + east(4), 45.005],
    [0.01, 45.01],
    [0, 45.01],
    [0, 45],
  ];
  assert.deepEqual(simplifyRing(ring, 5), [
    [0, 45],
    [0.005, 45 - north(6)],
    [0.01, 45],
    [0.01, 45.01],
    [0, 45.01],
    [0, 45],
  ]);
});

test("roundRing drops repeated positions and rings that collapse", () => {
  assert.deepEqual(
    roundRing(
      [
        [0.000001, 0],
        [1, 0],
        [1.000001, 0],
        [1, 1],
        [0, 0.000001],
        [0.000001, 0],
      ],
      5,
    ),
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  );
  assert.equal(roundRing(square(0, 0, 0.000001, 0.000001), 5), null);
});
