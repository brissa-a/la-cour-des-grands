import assert from "node:assert/strict"

export function jpegSize(jpeg: Buffer): { readonly width: number; readonly height: number } {
  assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff])
  let at = 2
  while (at + 9 < jpeg.length) {
    const marker = jpeg.readUInt16BE(at)
    if (marker >= 0xffc0 && marker <= 0xffc2) return { height: jpeg.readUInt16BE(at + 5), width: jpeg.readUInt16BE(at + 7) }
    at += 2 + jpeg.readUInt16BE(at + 2)
  }
  throw new Error("no frame header in the JPEG")
}
