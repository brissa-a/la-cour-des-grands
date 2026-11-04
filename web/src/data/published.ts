import { fetchUnder, PUBLISHED_ROOT } from "./source.ts"

export const readPublished = fetchUnder((import.meta.env.DEV && import.meta.env.VITE_DATA_ROOT) || PUBLISHED_ROOT)
