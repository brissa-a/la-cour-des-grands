import { useEffect, useMemo, useState } from "react"
import { loadCommunes, loadOfficialPages, type Assembly, type DeputyId } from "./data/assembly.ts"
import { colorableFeatures, type FeatureKey, type FeatureStore } from "./data/features.ts"
import { buildChart } from "./layout/chart.ts"
import { buildColoring, type Coloring } from "./coloring/coloring.ts"
import { FeaturePicker } from "./coloring/FeaturePicker.tsx"
import { useColoring } from "./coloring/useColoring.ts"
import { DEFAULT_COLORING, HIDDEN_FEATURES } from "./coloring/views.ts"
import { SEAT_RADIUS, Stage, type DeputyHandlers } from "./layout/Stage.tsx"
import { Legend } from "./layout/Legend.tsx"
import { DeputyCard } from "./profile/DeputyCard.tsx"
import { Search } from "./search/Search.tsx"
import { Footer } from "./Footer.tsx"
import { readParam, writeParam } from "./url.ts"

const NO_IDS: ReadonlySet<DeputyId> = new Set()

type Props = { assembly: Assembly; store: FeatureStore; initialColoring: Coloring }

export function App({ assembly, store, initialColoring }: Props) {
  const features = useMemo(() => colorableFeatures(assembly, HIDDEN_FEATURES), [assembly])
  const [shown, setShown] = useState<DeputyId>(() => randomDeputy(assembly))
  const [pinned, setPinned] = useState<DeputyId | null>(null)
  const [searchResults, setSearchResults] = useState(NO_IDS)
  const [hoveredValue, setHoveredValue] = useState<string | null>(null)
  const [showPhotos, setShowPhotos] = useState(() => readParam("showPic") === "true")
  const [coloring, requestColoring] = useColoring(store, features, assembly.deputies, initialColoring)
  const [chartKey, setChartKey] = useState<FeatureKey | null>(null)
  const [chartBy, requestChartBy] = useColoring(store, features, assembly.deputies, null)
  const [officialPages, setOfficialPages] = useState<ReadonlyMap<DeputyId, string>>(new Map())

  useEffect(() => {
    loadOfficialPages().then(setOfficialPages, (error: unknown) => console.error(error))
  }, [])

  const handlers = useMemo<DeputyHandlers>(
    () => ({ show: setShown, pin: id => setPinned(current => (current === id ? null : id)) }),
    [],
  )

  const selectColoring = (key: FeatureKey | null) => {
    if (!key) return
    writeParam("color", key === DEFAULT_COLORING ? null : key)
    requestColoring(key)
  }

  const selectChart = (key: FeatureKey | null) => {
    writeParam("chart", key)
    setChartKey(key)
    if (key) requestChartBy(key)
  }

  useEffect(() => {
    const requested = readParam("chart") as FeatureKey | null
    if (requested && features.some(f => f.key === requested)) selectChart(requested)
  }, [])

  const chart = useMemo(
    () => (chartKey && chartBy?.key === chartKey ? buildChart(chartBy, coloring, assembly.deputies, SEAT_RADIUS) : null),
    [chartKey, chartBy, coloring, assembly],
  )

  const cardId = pinned ?? shown
  const deputy = assembly.byId.get(cardId)

  const highlighted = useMemo(() => {
    const ids = new Set(searchResults)
    ids.add(cardId)
    if (hoveredValue !== null) for (const d of assembly.deputies) if (coloring.valueOf(d.id) === hoveredValue) ids.add(d.id)
    return ids
  }, [searchResults, cardId, hoveredValue, coloring, assembly])

  const togglePhotos = () => {
    setShowPhotos(!showPhotos)
    writeParam("showPic", showPhotos ? null : "true")
  }

  return (
    <div className="app">
      <main className="stage">
        <Stage
          assembly={assembly}
          chart={chart}
          highlighted={highlighted}
          showPhotos={showPhotos}
          colorOf={coloring.colorOf}
          handlers={handlers}
        />
        <Legend coloring={coloring} onHover={setHoveredValue} />
        <div className="controls panel">
          <FeaturePicker label="Disposition" features={features} selected={chartKey} onSelect={selectChart} noneLabel="Hémicycle" />
          <FeaturePicker label="Colorier par" features={features} selected={coloring.key} onSelect={selectColoring} />
          <label className="control">
            <input type="checkbox" checked={showPhotos} onChange={togglePhotos} /> Afficher les photos
          </label>
        </div>
      </main>
      {deputy && (
        <DeputyCard
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

export async function loadInitialColoring(assembly: Assembly, store: FeatureStore): Promise<Coloring> {
  const features = colorableFeatures(assembly, HIDDEN_FEATURES)
  const requested = readParam("color")
  const source = features.find(f => f.key === requested) ?? features.find(f => f.key === DEFAULT_COLORING)
  if (!source) throw new Error(`catalog.json: no feature ${DEFAULT_COLORING}`)
  return buildColoring(store, source, assembly.deputies)
}

function randomDeputy(assembly: Assembly): DeputyId {
  const deputy = assembly.deputies[Math.floor(Math.random() * assembly.deputies.length)]
  if (!deputy) throw new Error("init.csv: no deputy in office")
  return deputy.id
}
