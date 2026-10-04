import { useEffect, useMemo, useState } from "react"
import { loadCommunes, loadOfficialPages, type Assembly, type DeputyId, type Group } from "./data/assembly.ts"
import { Hemicycle, type DeputyHandlers } from "./hemicycle/Hemicycle.tsx"
import { Legend } from "./hemicycle/Legend.tsx"
import { DeputyCard } from "./profile/DeputyCard.tsx"
import { Search } from "./search/Search.tsx"
import { Footer } from "./Footer.tsx"
import { readShowPhotos, writeShowPhotos } from "./url.ts"

const NO_IDS: ReadonlySet<DeputyId> = new Set()

export function App({ assembly }: { assembly: Assembly }) {
  const [shown, setShown] = useState<DeputyId>(() => randomDeputy(assembly))
  const [pinned, setPinned] = useState<DeputyId | null>(null)
  const [searchResults, setSearchResults] = useState(NO_IDS)
  const [hoveredGroup, setHoveredGroup] = useState<Group | null>(null)
  const [showPhotos, setShowPhotos] = useState(readShowPhotos)
  const [officialPages, setOfficialPages] = useState<ReadonlyMap<DeputyId, string>>(new Map())

  useEffect(() => {
    loadOfficialPages().then(setOfficialPages, (error: unknown) => console.error(error))
  }, [])

  const handlers = useMemo<DeputyHandlers>(
    () => ({ show: setShown, pin: id => setPinned(current => (current === id ? null : id)) }),
    [],
  )

  const cardId = pinned ?? shown
  const deputy = assembly.byId.get(cardId)

  const highlighted = useMemo(() => {
    const ids = new Set(searchResults)
    ids.add(cardId)
    if (hoveredGroup) for (const d of assembly.deputies) if (d.politicalGroup === hoveredGroup) ids.add(d.id)
    return ids
  }, [searchResults, cardId, hoveredGroup, assembly])

  const togglePhotos = () => {
    setShowPhotos(!showPhotos)
    writeShowPhotos(!showPhotos)
  }

  return (
    <div className="app">
      <main className="stage">
        <Hemicycle assembly={assembly} highlighted={highlighted} showPhotos={showPhotos} handlers={handlers} />
        <Legend groups={assembly.groups} onHover={setHoveredGroup} />
        <label className="photos-toggle panel">
          <input type="checkbox" checked={showPhotos} onChange={togglePhotos} /> Afficher les photos
        </label>
      </main>
      {deputy && (
        <DeputyCard
          key={deputy.id}
          deputy={deputy}
          pinned={pinned !== null}
          officialPage={officialPages.get(deputy.id)}
          onUnpin={() => setPinned(null)}
        />
      )}
      <Search assembly={assembly} loadCommunes={loadCommunes} handlers={handlers} onResults={setSearchResults} />
      <Footer />
    </div>
  )
}

function randomDeputy(assembly: Assembly): DeputyId {
  const deputy = assembly.deputies[Math.floor(Math.random() * assembly.deputies.length)]
  if (!deputy) throw new Error("init.csv: no deputy in office")
  return deputy.id
}
