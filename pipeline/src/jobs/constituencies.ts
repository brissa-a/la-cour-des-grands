import { entity } from "../core/entity.ts";
import { job } from "../core/job.ts";
import { type ConstituencyCode, deputies, inOffice, lastMandate } from "./deputies.ts";

export type Constituency = {
  code: ConstituencyCode;
  seat: number;
};

export const constituencies = job({
  name: "constituencies",
  dependencies: { deputies },
  run({ deputies }): Constituency[] {
    return deputies
      .filter(inOffice)
      .map((d) => {
        const { constituency, seat } = lastMandate(d);
        if (seat === null) throw new Error(`No seat for ${d.id} (${constituency})`);
        return { code: constituency, seat: Number(seat) };
      })
      .sort((a, b) => a.seat - b.seat);
  },
});

export const constituency = entity({
  name: "constituency",
  folder: "constituencies",
  key: "constituency",
  rows: constituencies,
  id: (c: Constituency) => c.code,
});
