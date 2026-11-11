import { fileURLToPath } from "node:url"
import { readPointer } from "../src/snapshot.ts"

export const DATA_ROOT = fileURLToPath(new URL("data", import.meta.url))

const pointer = await readPointer(DATA_ROOT)
if (pointer.kind === "failed") throw new Error(`test/data: ${pointer.reason}; build it with test/makeDataRoot.ts`)

export const { version: VERSION, pointer: POINTER } = pointer
