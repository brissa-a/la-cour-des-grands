import { readFile } from "node:fs/promises";
import { csv, writeOutput } from "../core/csv.ts";
import { job } from "../core/job.ts";
import { entity } from "../core/entity.ts";
import type { ConstituencyCode } from "./address/codes.ts";
import { type Deputy, type DeputyId, type SeatNumber, deputies, inOffice, lastMandate, seatNumber } from "./deputies.ts";
import { type Ballot, ballots } from "./votes.ts";

type SeatBlock = readonly [first: number, last: number];

// Seat numbers of each row of the room, from the front row to the back, left to right.
// Numbers from 3000 are empty spots and from 4000 the government benches: they shape the rows but are not seats.
const FIRST_NON_SEAT = 3000;
const ROWS: readonly (readonly SeatBlock[])[] = [
  [[3001, 3003], [75, 77], [162, 164], [4001, 4009], [489, 491], [3004, 3007]],
  [[1, 3], [78, 80], [165, 167], [4011, 4019], [492, 494], [576, 578]],
  [[5, 7], [81, 84], [168, 171], [248, 251], [329, 332], [409, 412], [495, 498], [580, 582]],
  [[8, 11], [85, 88], [172, 175], [253, 256], [333, 336], [413, 416], [499, 502], [583, 586]],
  [[12, 16], [89, 93], [176, 180], [257, 261], [337, 341], [417, 421], [503, 507], [587, 591]],
  [[17, 22], [94, 99], [181, 186], [262, 267], [342, 347], [422, 427], [508, 513], [592, 597]],
  [[23, 26], [27, 28], [100, 106], [187, 193], [268, 274], [348, 354], [428, 434], [514, 520], [599, 600], [601, 604]],
  [[30, 33], [35, 36], [108, 114], [195, 201], [276, 282], [356, 362], [436, 442], [522, 528], [606, 607], [609, 612]],
  [[38, 41], [43, 45], [116, 120], [122, 125], [203, 207], [209, 212], [284, 288], [290, 293], [364, 368], [370, 373], [444, 448], [450, 453], [530, 534], [536, 539], [614, 616], [618, 621]],
  [[47, 51], [52, 54], [126, 130], [132, 135], [213, 217], [219, 222], [294, 298], [300, 303], [374, 378], [380, 383], [454, 458], [460, 463], [540, 544], [546, 549], [623, 625], [626, 630]],
  [[56, 60], [62, 64], [136, 141], [143, 147], [223, 228], [230, 234], [304, 309], [311, 315], [384, 389], [391, 395], [464, 469], [471, 475], [550, 555], [557, 561], [632, 634], [636, 640]],
  [[66, 68], [70, 73], [148, 158], [235, 245], [317, 327], [397, 407], [478, 488], [564, 574], [642, 645], [648, 650]],
];

const FIRST_ROW_RADIUS = 5;

function unpack(blocks: readonly SeatBlock[]): SeatNumber[] {
  return blocks.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, i) => seatNumber(String(start + i))));
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

function seatPositions(): Map<SeatNumber, { x: number; y: number }> {
  const maxRadius = FIRST_ROW_RADIUS + ROWS.length - 1;
  const positions = new Map<SeatNumber, { x: number; y: number }>();
  ROWS.map(unpack).forEach((seats, rowIndex) => {
    const radius = (FIRST_ROW_RADIUS + rowIndex) / maxRadius;
    seats.forEach((seat, i) => {
      const angle = (i * Math.PI) / (seats.length - 1);
      positions.set(seat, { x: round(Math.cos(angle) * radius), y: round(-Math.sin(angle) * radius) });
    });
  });
  return positions;
}

type Seat = { number: SeatNumber; x: number; y: number; deputy: DeputyId | null; constituency: ConstituencyCode | null };

export type Sitting = { seat: SeatNumber; constituency: ConstituencyCode };

export function vacantConstituencySeats(
  emptySeats: ReadonlySet<SeatNumber>,
  heldConstituencies: ReadonlySet<ConstituencyCode>,
  chronologicalSittings: readonly Sitting[],
): Map<SeatNumber, ConstituencyCode> {
  const constituencyBySeat = new Map<SeatNumber, ConstituencyCode>();
  const placed = new Set<ConstituencyCode>();
  for (const { seat, constituency } of chronologicalSittings.toReversed()) {
    if (!emptySeats.has(seat) || heldConstituencies.has(constituency)) continue;
    if (placed.has(constituency) || constituencyBySeat.has(seat)) continue;
    constituencyBySeat.set(seat, constituency);
    placed.add(constituency);
  }
  return constituencyBySeat;
}

export function roomSeats(deputies: readonly Deputy[], chronologicalBallots: readonly Pick<Ballot, "id" | "seats">[]): Seat[] {
  const holderBySeat = new Map<SeatNumber, Deputy>();
  const holderByConstituency = new Map<ConstituencyCode, DeputyId>();
  for (const d of deputies.filter(inOffice)) {
    const { seat, constituency } = lastMandate(d);
    if (seat === null) throw new Error(`No seat for ${d.id}`);
    const other = holderBySeat.get(seat);
    if (other !== undefined) throw new Error(`Seat ${seat} held by both ${other.id} and ${d.id}`);
    const sameConstituency = holderByConstituency.get(constituency);
    if (sameConstituency !== undefined) throw new Error(`Constituency ${constituency} held by both ${sameConstituency} and ${d.id}`);
    holderBySeat.set(seat, d);
    holderByConstituency.set(constituency, d.id);
  }
  const plan = [...seatPositions()].filter(([number]) => number < FIRST_NON_SEAT);
  const unknown = [...holderBySeat.keys()].filter((n) => !plan.some(([number]) => number === n));
  if (unknown.length > 0) throw new Error(`Seats not in the room plan: ${unknown.join(", ")}`);

  const constituencyOf = new Map(deputies.map((d) => [d.id, lastMandate(d).constituency]));
  const sittings = chronologicalBallots.flatMap((ballot) =>
    [...ballot.seats].map(([id, seat]): Sitting => {
      const constituency = constituencyOf.get(id);
      if (constituency === undefined) throw new Error(`${ballot.id}: ${id} is not a deputy of the legislature`);
      return { seat, constituency };
    }),
  );
  const emptySeats = new Set(plan.map(([number]) => number).filter((number) => !holderBySeat.has(number)));
  const vacant = vacantConstituencySeats(emptySeats, new Set(holderByConstituency.keys()), sittings);

  return plan
    .map(([number, position]) => {
      const holder = holderBySeat.get(number);
      return {
        number,
        ...position,
        deputy: holder?.id ?? null,
        constituency: holder === undefined ? (vacant.get(number) ?? null) : lastMandate(holder).constituency,
      };
    })
    .sort((a, b) => a.number - b.number);
}

export const seats = job({
  name: "seats",
  dependencies: { deputies, ballots },
  run: ({ deputies, ballots }) => roomSeats(deputies, ballots),
});

export const seat = entity({
  name: "seat",
  folder: "seats",
  key: "seat",
  rows: seats,
  id: (s: Seat) => String(s.number),
});

const BACKGROUND = `${seat.folder}/hemicycle.svg`;

const background = job({
  name: BACKGROUND,
  dependencies: {},
  run: async () => writeOutput(BACKGROUND, await readFile("assets/hemicycle.svg")),
});

export const hemicycle = csv({
  entity: seat,
  file: "hemicycle.csv",
  dependencies: { background },
  features: {
    x: { title: "x", type: "number" },
    y: { title: "y", type: "number" },
    deputy: { title: "Député", type: "reference", entity: "deputy" },
    constituency: { title: "Circonscription", type: "code" },
  },
  layout: { background: BACKGROUND },
  row: (s) => ({ x: s.x, y: s.y, deputy: s.deputy, constituency: s.constituency }),
});
