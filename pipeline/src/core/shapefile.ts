import type { Position, Ring } from "./geometry.ts";

const POLYGON = 5;
const NULL_SHAPE = 0;
const FILE_HEADER_BYTES = 100;
const DBF_FIELD_DESCRIPTOR_BYTES = 32;
const DBF_HEADER_TERMINATOR = 0x0d;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function readDbfField(dbf: Uint8Array, name: string): string[] {
  const data = view(dbf);
  const count = data.getUint32(4, true);
  const headerLength = data.getUint16(8, true);
  const recordLength = data.getUint16(10, true);
  const decoder = new TextDecoder();
  let offset = 1;
  for (let d = 32; dbf[d] !== DBF_HEADER_TERMINATOR; d += DBF_FIELD_DESCRIPTOR_BYTES) {
    const fieldName = decoder.decode(dbf.subarray(d, d + 11)).replace(/\0.*$/s, "");
    const length = dbf[d + 16]!;
    if (fieldName === name) {
      return Array.from({ length: count }, (_, r) => {
        const record = headerLength + r * recordLength;
        if (dbf[record] === 0x2a) throw new Error(`dbf record ${r} is marked deleted`);
        return decoder.decode(dbf.subarray(record + offset, record + offset + length)).trim();
      });
    }
    offset += length;
  }
  throw new Error(`dbf has no field ${name}`);
}

function readRings(shp: Uint8Array): Ring[][] {
  const data = view(shp);
  const shapes: Ring[][] = [];
  for (let record = FILE_HEADER_BYTES; record < shp.byteLength; ) {
    const content = record + 8;
    const contentLength = data.getInt32(record + 4, false) * 2;
    const type = data.getInt32(content, true);
    if (type === NULL_SHAPE) shapes.push([]);
    else if (type !== POLYGON) throw new Error(`Unsupported shape type ${type}`);
    else {
      const partCount = data.getInt32(content + 36, true);
      const pointCount = data.getInt32(content + 40, true);
      const points = content + 44 + 4 * partCount;
      const starts = Array.from({ length: partCount }, (_, i) => data.getInt32(content + 44 + 4 * i, true));
      shapes.push(
        starts.map((start, i) => {
          const end = starts[i + 1] ?? pointCount;
          return Array.from({ length: end - start }, (_, j): Position => [
            data.getFloat64(points + 16 * (start + j), true),
            data.getFloat64(points + 16 * (start + j) + 8, true),
          ]);
        }),
      );
    }
    record = content + contentLength;
  }
  return shapes;
}

export function readPolygonShapes(shp: Uint8Array, dbf: Uint8Array, idField: string): { id: string; rings: Ring[] }[] {
  const ids = readDbfField(dbf, idField);
  const shapes = readRings(shp);
  if (ids.length !== shapes.length) throw new Error(`${ids.length} dbf records for ${shapes.length} shapes`);
  return ids.map((id, i) => ({ id, rings: shapes[i]! }));
}
