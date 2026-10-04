import { csv, writeOutput } from "../core/csv.ts";
import { job } from "../core/job.ts";
import { constituency } from "./constituencies.ts";

// Seat numbers of each row of the room, from the front row to the back, left to right.
// Numbers from 3000 are empty spots and from 4000 the government benches: they shape the rows but hold no deputy.
const ROWS = [
  ["3001-3003", "75-77", "162-164", "4001-4009", "489-491", "3004-3007"],
  ["1-3", "78-80", "165-167", "4011-4019", "492-494", "576-578"],
  ["5-7", "81-84", "168-171", "248-251", "329-332", "409-412", "495-498", "580-582"],
  ["8-11", "85-88", "171-175", "253-256", "333-336", "413-416", "499-502", "583-586"],
  ["12-16", "89-93", "176-180", "257-261", "337-341", "417-421", "503-507", "587-591"],
  ["17-22", "94-99", "181-186", "262-267", "342-347", "422-427", "508-513", "592-597"],
  ["23-26", "27-28", "100-106", "187-193", "268-274", "348-354", "428-434", "514-520", "599-600", "601-604"],
  ["30-33", "35-36", "108-114", "195-201", "276-282", "356-362", "436-442", "522-528", "606-607", "609-612"],
  ["38-41", "43-45", "116-120", "122-125", "203-207", "209-212", "284-288", "290-293", "364-368", "370-373", "444-448", "450-453", "530-534", "536-539", "614-616", "618-621"],
  ["47-51", "52-54", "126-130", "132-135", "213-217", "219-222", "294-298", "300-303", "374-378", "380-383", "454-458", "460-463", "540-544", "546-549", "623-625", "626-630"],
  ["56-60", "62-64", "136-141", "143-147", "223-228", "230-234", "304-309", "311-315", "384-389", "391-395", "464-469", "471-475", "550-555", "557-561", "632-634", "636-640"],
  ["66-68", "70-73", "148-158", "235-245", "317-327", "397-407", "478-488", "564-574", "642-645", "648-650"],
];

const FIRST_ROW_RADIUS = 5;

function unpack(blocks: string[]): number[] {
  return blocks.flatMap((block) => {
    const [start, end] = block.split("-").map(Number) as [number, number];
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

function seatPositions(): Map<number, { x: number; y: number }> {
  const maxRadius = FIRST_ROW_RADIUS + ROWS.length - 1;
  const positions = new Map<number, { x: number; y: number }>();
  ROWS.map(unpack).forEach((seats, rowIndex) => {
    const radius = (FIRST_ROW_RADIUS + rowIndex) / maxRadius;
    seats.forEach((seat, i) => {
      const angle = (i * Math.PI) / (seats.length - 1);
      positions.set(seat, { x: round(Math.cos(angle) * radius), y: round(-Math.sin(angle) * radius) });
    });
  });
  return positions;
}

function backgroundSvg(): string {
  const maxRadius = FIRST_ROW_RADIUS + ROWS.length - 1;
  const arcs = ROWS.map((_, rowIndex) => {
    const r = round((FIRST_ROW_RADIUS + rowIndex) / maxRadius);
    return `  <path d="M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0" />`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.05 -1.05 2.1 1.1">`,
    `<g fill="none" stroke="currentColor" stroke-opacity="0.15" stroke-width="0.004">`,
    ...arcs,
    `</g>`,
    `</svg>`,
    "",
  ].join("\n");
}

const SEATS = seatPositions();
const BACKGROUND = "hemicycle.svg";

const background = job({
  name: `${constituency.folder}/${BACKGROUND}`,
  dependencies: {},
  run: () => writeOutput(`${constituency.folder}/${BACKGROUND}`, backgroundSvg()),
});

export const hemicycle = csv({
  entity: constituency,
  file: "hemicycle.csv",
  dependencies: { background },
  features: {
    seat: { title: "Siège", type: "code" },
    x: { title: "x", type: "number" },
    y: { title: "y", type: "number" },
  },
  layout: { background: `${constituency.folder}/${BACKGROUND}` },
  row: (c) => {
    const position = SEATS.get(c.seat);
    if (position === undefined) throw new Error(`Seat ${c.seat} of ${c.code} is not in the room plan`);
    return { seat: String(c.seat), ...position };
  },
});
