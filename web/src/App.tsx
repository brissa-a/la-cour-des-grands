import { useCallback, useEffect, useMemo, useState } from "react"
import { AddressBlock } from "./address/AddressBlock.tsx"
import type { Located } from "./address/lookup.ts"
import { createLookupSources } from "./address/sources.ts"
import { loadCommunes, loadOfficialPages, type Assembly, type DeputyId } from "./data/assembly.ts"
import { colorableFeatures, type FeatureKey, type FeatureStore } from "./data/features.ts"
import { buildChart } from "./layout/chart.ts"
import { buildColoring, type Coloring } from "./coloring/coloring.ts"
import { FeaturePicker } from "./coloring/FeaturePicker.tsx"
import { useColoring } from "./coloring/useColoring.ts"
import { DEFAULT_COLORING, HIDDEN_FEATURES } from "./coloring/views.ts"
import { SEAT_RADIUS, Stage } from "./layout/Stage.tsx"
import { Legend } from "./layout/Legend.tsx"
import { useMediaQuery } from "./layout/useMediaQuery.ts"
import { ConfigButton, ConfigPanel } from "./config/ConfigPanel.tsx"
import { useConfig } from "./config/useConfig.ts"
import { hasOpenedPanel, rememberPanelOpened } from "./preview/firstUse.ts"
import { neighbour, type Direction } from "./preview/neighbours.ts"
import { PreviewCard } from "./preview/PreviewCard.tsx"
import { cardShown, createPreviewStore, usePreview, type Hit, type PreviewStore } from "./preview/previewStore.ts"
import { Reader } from "./preview/Reader.tsx"
import { DeputyPanel } from "./profile/DeputyPanel.tsx"
import { Search } from "./search/Search.tsx"
import { Footer } from "./Footer.tsx"
import { pushParam, readParam, writeParam } from "./url.ts"

const NO_IDS: ReadonlySet<DeputyId> = new Set()
const PANEL_HISTORY_STATE = { panel: true }
const PHONE = "(max-width: 759px)"
const TOUCH_ONLY = "(hover: none)"

type Props = { assembly: Assembly; store: FeatureStore; initialColoring: Coloring }

export function App({ assembly, store, initialColoring }: Props) {
  const features = useMemo(() => colorableFeatures(assembly, HIDDEN_FEATURES), [assembly])
  const previewOptions = useConfig("preview")
  const [preview] = useState(() => createPreviewStore(previewOptions))
  const [selected, setSelected] = useState<DeputyId | null>(() => deputyInUrl(assembly))
  const [panelId, setPanelId] = useState<DeputyId | null>(selected)
  const [hint, setHint] = useState(() => !hasOpenedPanel())
  const [searchResults, setSearchResults] = useState(NO_IDS)
  const [hoveredValue, setHoveredValue] = useState<string | null>(null)
  const [showPhotos, setShowPhotos] = useState(() => readParam("showPic") === "true")
  const [coloring, requestColoring] = useColoring(store, features, assembly.deputies, initialColoring)
  const [chartKey, setChartKey] = useState<FeatureKey | null>(null)
  const [chartBy, requestChartBy] = useColoring(store, features, assembly.deputies, null)
  const [officialPages, setOfficialPages] = useState<ReadonlyMap<DeputyId, string>>(new Map())
  const [configOpen, setConfigOpen] = useState(false)
  const lookupSources = useMemo(() => createLookupSources(assembly.catalog), [assembly])
  const [addressContext, setAddressContext] = useState<Located | null>(null)
  const phone = useMediaQuery(PHONE)
  const touchOnly = useMediaQuery(TOUCH_ONLY)

  useEffect(() => {
    loadOfficialPages().then(setOfficialPages, (error: unknown) => console.error(error))
  }, [])

  useEffect(() => preview.configure(previewOptions), [preview, previewOptions])

  useEffect(() => {
    if (isPanelHistoryEntry(history.state)) history.replaceState(null, "")
    if (readParam("deputy") !== null && selected === null) writeParam("deputy", null)
  }, [])

  const open = (id: DeputyId) => {
    if (id === selected) return
    setAddressContext(null)
    show(id)
  }

  const openFromAddress = (id: DeputyId, located: Located) => {
    setAddressContext(located)
    show(id)
  }

  const show = (id: DeputyId) => {
    if (id === selected) return
    if (selected === null) pushParam("deputy", id, PANEL_HISTORY_STATE)
    else writeParam("deputy", id)
    rememberPanelOpened()
    setHint(false)
    setSelected(id)
    setPanelId(id)
  }

  const close = () => {
    if (selected === null) return
    setAddressContext(null)
    if (isPanelHistoryEntry(history.state)) {
      history.back()
      return
    }
    writeParam("deputy", null)
    setSelected(null)
  }

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

  useEffect(() => {
    const onPopState = () => {
      const id = deputyInUrl(assembly)
      setSelected(id)
      if (id) setPanelId(id)
      else setAddressContext(null)
      writeParam("color", coloring.key === DEFAULT_COLORING ? null : coloring.key)
      writeParam("chart", chartKey)
      writeParam("showPic", showPhotos ? "true" : null)
    }
    addEventListener("popstate", onPopState)
    return () => removeEventListener("popstate", onPopState)
  }, [assembly, coloring.key, chartKey, showPhotos])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (e.target instanceof HTMLInputElement && e.target.type === "search") return
      if (!phone && cardShown(preview.get().card, selected)) preview.dismiss()
      else close()
    }
    addEventListener("keydown", onKeyDown)
    return () => removeEventListener("keydown", onKeyDown)
  })

  const chart = useMemo(
    () => (chartKey && chartBy?.key === chartKey ? buildChart(chartBy, coloring, assembly.deputies, SEAT_RADIUS) : null),
    [chartKey, chartBy, coloring, assembly],
  )
  const layoutBy = chart ? chartBy : null

  const seatPositions = useMemo(() => new Map(assembly.deputies.map(d => [d.id, d.seat])), [assembly])

  const onTap = (hit: Hit | null, pointerType: string) => {
    const shown = cardShown(preview.get().card, selected)
    if (pointerType !== "touch") {
      if (hit) open(hit.id)
      else close()
    } else if (phone) {
      if (!hit) close()
      else {
        preview.show(hit.id, null)
        if (selected !== null) open(hit.id)
      }
    } else if (hit) {
      if (shown && preview.get().card?.id === hit.id) open(hit.id)
      else preview.show(hit.id, hit.geometry)
    } else if (shown) preview.dismiss()
    else close()
  }

  const step = (from: DeputyId, direction: Direction) => {
    const positions = chart?.positions ?? seatPositions
    const next = neighbour(positions, from, direction, chart ? { kind: "chart", rowTolerance: chart.pitch / 2 } : { kind: "hemicycle" })
    if (next) preview.show(next, null)
  }

  const highlighted = useMemo(() => {
    if (hoveredValue === null) return searchResults
    const ids = new Set(searchResults)
    for (const d of assembly.deputies) if (coloring.valueOf(d.id) === hoveredValue) ids.add(d.id)
    return ids
  }, [searchResults, hoveredValue, coloring, assembly])

  const toggleConfig = () => {
    if (!configOpen) preview.halo(null)
    setConfigOpen(!configOpen)
  }

  const closeConfig = useCallback(() => setConfigOpen(false), [])

  const togglePhotos = () => {
    setShowPhotos(!showPhotos)
    writeParam("showPic", showPhotos ? null : "true")
  }

  const panelDeputy = panelId === null ? undefined : assembly.byId.get(panelId)

  return (
    <div className={selected ? "app panel-open" : "app"}>
      <main className="stage">
        <Stage
          assembly={assembly}
          chart={chart}
          highlighted={highlighted}
          showPhotos={showPhotos}
          colorOf={coloring.colorOf}
          store={preview}
          selected={selected}
          onTap={onTap}
        />
        <div className="stage-bottom">
          {hint && selected === null && !phone && <RestHint store={preview} touch={touchOnly} />}
          <Legend coloring={coloring} store={preview} selected={selected} onHover={setHoveredValue} />
        </div>
        <div className="controls panel" data-obstacle="">
          <FeaturePicker label="Disposition" features={features} selected={chartKey} onSelect={selectChart} noneLabel="Hémicycle" />
          <FeaturePicker label="Colorier par" features={features} selected={coloring.key} onSelect={selectColoring} />
          <div className="control-row">
            <label className="control">
              <input type="checkbox" checked={showPhotos} onChange={togglePhotos} /> Afficher les photos
            </label>
            <ConfigButton open={configOpen} onToggle={toggleConfig} />
          </div>
        </div>
      </main>
      {configOpen && <ConfigPanel onClose={closeConfig} />}
      {phone ? (
        <Reader store={preview} assembly={assembly} coloring={coloring} onOpen={open} onStep={step} />
      ) : (
        <PreviewCard
          store={preview}
          assembly={assembly}
          coloring={coloring}
          layoutBy={layoutBy}
          selected={selected}
          hint={hint}
          touch={touchOnly}
          onOpen={open}
        />
      )}
      {panelDeputy && (
        <DeputyPanel
          deputy={panelDeputy}
          open={selected !== null}
          coloring={coloring}
          chart={chart}
          layoutBy={layoutBy}
          total={assembly.deputies.length}
          officialPage={officialPages.get(panelDeputy.id)}
          address={
            addressContext && <AddressBlock located={addressContext} deputy={panelDeputy} assembly={assembly} onOpen={show} />
          }
          onClose={close}
        />
      )}
      <Search
        assembly={assembly}
        loadCommunes={loadCommunes}
        lookupSources={lookupSources}
        onHalo={preview.halo}
        onSelect={open}
        onAddress={openFromAddress}
        onResults={setSearchResults}
      />
      <Footer />
    </div>
  )
}

function RestHint({ store, touch }: { store: PreviewStore; touch: boolean }) {
  const { target, card } = usePreview(store)
  if (target !== null || card?.visible) return null
  return (
    <p className="stage-hint" data-obstacle="">
      {touch
        ? "Touchez un point pour voir qui siège là · touchez à nouveau pour ouvrir sa fiche"
        : "Survolez un point pour voir qui siège là · cliquez pour ouvrir sa fiche"}
    </p>
  )
}

function deputyInUrl(assembly: Assembly): DeputyId | null {
  const id = readParam("deputy") as DeputyId | null
  return id !== null && assembly.byId.has(id) ? id : null
}

function isPanelHistoryEntry(state: unknown): boolean {
  return typeof state === "object" && state !== null && "panel" in state && state.panel === true
}

export async function loadInitialColoring(assembly: Assembly, store: FeatureStore): Promise<Coloring> {
  const features = colorableFeatures(assembly, HIDDEN_FEATURES)
  const requested = readParam("color")
  const source = features.find(f => f.key === requested) ?? features.find(f => f.key === DEFAULT_COLORING)
  if (!source) throw new Error(`catalog.json: no feature ${DEFAULT_COLORING}`)
  return buildColoring(store, source, assembly.deputies)
}
