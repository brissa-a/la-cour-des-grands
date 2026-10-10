import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AddressBlock } from "./address/AddressBlock.tsx"
import type { Located } from "./address/lookup.ts"
import { createLookupSources } from "./address/sources.ts"
import { loadCommunes, loadOfficialPages, type Assembly, type DeputyId, type Person, type Sitting } from "./data/assembly.ts"
import { colorableFeatures, type ColorableFeature, type FeatureStore } from "./data/features.ts"
import { buildChart } from "./layout/chart.ts"
import { buildColoring, VOTE, type Coloring, type ColoringKey, type FeatureColoring } from "./coloring/coloring.ts"
import { FeaturePicker } from "./coloring/FeaturePicker.tsx"
import { useColoring } from "./coloring/useColoring.ts"
import { voteColoring } from "./coloring/voteColoring.ts"
import { DEFAULT_COLORING, HIDDEN_FEATURES } from "./coloring/views.ts"
import { SEAT_RADIUS, Stage } from "./layout/Stage.tsx"
import { Legend } from "./layout/Legend.tsx"
import { VoteHeader } from "./layout/VoteHeader.tsx"
import { useChartFrame } from "./layout/useChartFrame.ts"
import { useMediaQuery } from "./layout/useMediaQuery.ts"
import { ConfigButton, ConfigPanel } from "./config/ConfigPanel.tsx"
import { useConfig } from "./config/useConfig.ts"
import { hasOpenedPanel, rememberPanelOpened } from "./preview/firstUse.ts"
import { neighbour, type Direction } from "./preview/neighbours.ts"
import { PreviewCard } from "./preview/PreviewCard.tsx"
import { cardShown, createPreviewStore, usePreview, type Hit, type PreviewStore } from "./preview/previewStore.ts"
import { Reader } from "./preview/Reader.tsx"
import { DeputyPanel } from "./profile/DeputyPanel.tsx"
import { longDate } from "./profile/format.ts"
import { Search } from "./search/Search.tsx"
import { Footer } from "./Footer.tsx"
import { pushParam, readParam, writeParam } from "./url.ts"
import type { VotePosition } from "./votes/positions.ts"
import { sittingOn } from "./votes/sitting.ts"
import { createVoteSource, type ReadVote } from "./votes/sources.ts"
import { useVoteView } from "./votes/useVoteView.ts"
import { voteId, type VoteId } from "./votes/voteId.ts"
import type { Vote } from "./votes/votes.ts"

const NO_IDS: ReadonlySet<DeputyId> = new Set()
const PANEL_HISTORY_STATE = { panel: true }
const PHONE = "(max-width: 759px)"
const TOUCH_ONLY = "(hover: none)"

type Props = { assembly: Assembly; store: FeatureStore; initialColoring: FeatureColoring }

type View = { color: ColoringKey; chart: ColoringKey | null; vote: VoteId | null }

type Hovered = { by: Coloring; value: string }

export function App({ assembly, store, initialColoring }: Props) {
  const features = useMemo(() => colorableFeatures(assembly, HIDDEN_FEATURES), [assembly])
  const votes = useMemo(() => createVoteSource(assembly.catalog, assembly.people), [assembly])
  const [initialView] = useState(() => viewInUrl(features, initialColoring))
  const [colorKey, setColorKey] = useState(initialView.color)
  const [chartKey, setChartKey] = useState(initialView.chart)
  const [shownVote, setShownVote] = useState(initialView.vote)
  const voteView = useVoteView(votes, shownVote)
  const voteInView = colorKey === VOTE || chartKey === VOTE
  const readVote = (voteView.status === "loading" ? voteView.previous : voteView.status === "ready" ? voteView : null)?.read ?? null
  const pastSitting = useMemo(() => readVote && sittingOn(assembly, readVote.reading.roster), [assembly, readVote])
  const sitting: Sitting = voteInView && pastSitting ? pastSitting : assembly
  const voteColor = useMemo(() => readVote && pastSitting && voteColoring(readVote, pastSitting.deputies), [readVote, pastSitting])
  const previewOptions = useConfig(config => config.preview)
  const [preview] = useState(() => createPreviewStore(previewOptions))
  const [selected, setSelected] = useState<DeputyId | null>(() => deputyInUrl(assembly))
  const [panelId, setPanelId] = useState<DeputyId | null>(selected)
  const [hint, setHint] = useState(() => !hasOpenedPanel())
  const [searchResults, setSearchResults] = useState(NO_IDS)
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const [showPhotos, setShowPhotos] = useState(() => readParam("showPic") === "true")
  const [featureColoring, requestColoring] = useColoring(store, features, sitting.deputies, initialColoring)
  const [chartFeature, requestChartBy] = useColoring(store, features, sitting.deputies, null)
  const coloring: Coloring = colorKey === VOTE && voteColor ? voteColor : featureColoring
  const chartBy: Coloring | null = chartKey === VOTE ? voteColor : chartFeature
  const [officialPages, setOfficialPages] = useState<ReadonlyMap<DeputyId, string>>(new Map())
  const [configOpen, setConfigOpen] = useState(false)
  const lookupSources = useMemo(() => createLookupSources(assembly.catalog), [assembly])
  const [addressContext, setAddressContext] = useState<Located | null>(null)
  const phone = useMediaQuery(PHONE)
  const touchOnly = useMediaQuery(TOUCH_ONLY)
  const svgRef = useRef<SVGSVGElement>(null)
  const chartFrame = useChartFrame(svgRef)

  useEffect(() => {
    loadOfficialPages().then(setOfficialPages, (error: unknown) => console.error(error))
  }, [])

  useEffect(() => preview.configure(previewOptions), [preview, previewOptions])

  useEffect(() => {
    if (isPanelHistoryEntry(history.state)) history.replaceState(null, "")
    if (readParam("deputy") !== null && selected === null) writeParam("deputy", null)
    writeView(initialView)
    if (initialView.chart !== null && initialView.chart !== VOTE) requestChartBy(initialView.chart)
  }, [])

  useEffect(() => {
    if (voteView.status !== "missing") return
    const view = { color: colorKey === VOTE ? featureColoring.key : colorKey, chart: chartKey === VOTE ? null : chartKey, vote: null }
    setColorKey(view.color)
    setChartKey(view.chart)
    setShownVote(null)
    writeView(view)
  }, [voteView.status])

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

  const selectColoring = (key: ColoringKey | null) => {
    if (key === null) return
    setColorKey(key)
    if (key !== VOTE) requestColoring(key)
    writeView({ color: key, chart: chartKey, vote: shownVote })
  }

  const selectChart = (key: ColoringKey | null) => {
    setChartKey(key)
    if (key !== null && key !== VOTE) requestChartBy(key)
    writeView({ color: colorKey, chart: key, vote: shownVote })
  }

  const pickVote = (vote: Vote) => {
    setShownVote(vote.id)
    setColorKey(VOTE)
    writeView({ color: VOTE, chart: chartKey, vote: vote.id })
  }

  useEffect(() => {
    const onPopState = () => {
      const id = deputyInUrl(assembly)
      setSelected(id)
      if (id) setPanelId(id)
      else setAddressContext(null)
      writeView({ color: colorKey, chart: chartKey, vote: shownVote })
      writeParam("showPic", showPhotos ? "true" : null)
    }
    addEventListener("popstate", onPopState)
    return () => removeEventListener("popstate", onPopState)
  }, [assembly, colorKey, chartKey, shownVote, showPhotos])

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
    () =>
      chartKey !== null && chartBy?.key === chartKey && chartFrame
        ? buildChart(chartBy, coloring, sitting.deputies, SEAT_RADIUS, chartFrame)
        : null,
    [chartKey, chartBy, coloring, sitting, chartFrame],
  )
  const layoutBy = chart ? chartBy : null

  const seatPositions = useMemo(() => new Map(sitting.deputies.map(d => [d.id, d.seat])), [sitting])

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
    if (hovered === null) return searchResults
    const ids = new Set(searchResults)
    for (const d of sitting.deputies) if (hovered.by.valueOf(d.id) === hovered.value) ids.add(d.id)
    return ids
  }, [searchResults, hovered, sitting])

  const hoverValue = (value: string | null) => setHovered(value === null ? null : { by: coloring, value })

  const hoverPosition = (position: VotePosition | null) =>
    setHovered(position === null || voteColor === null ? null : { by: voteColor, value: position })

  const toggleConfig = () => {
    if (!configOpen) preview.halo(null)
    setConfigOpen(!configOpen)
  }

  const closeConfig = useCallback(() => setConfigOpen(false), [])

  const togglePhotos = () => {
    setShowPhotos(!showPhotos)
    writeParam("showPic", showPhotos ? null : "true")
  }

  const panelDeputy = panelId === null ? undefined : (sitting.byId.get(panelId) ?? assembly.people.get(panelId))
  const panelOutOfView = panelDeputy === undefined ? null : outOfView(panelDeputy, sitting, voteInView ? readVote : null)
  const voteOption = shownVote === null ? null : readVote?.vote.id === shownVote ? `Scrutin n° ${readVote.vote.number}` : "Scrutin"

  return (
    <div className={selected ? "app panel-open" : "app"}>
      <main className="stage">
        <Stage
          svgRef={svgRef}
          sitting={sitting}
          background={assembly.background}
          chart={chart}
          highlighted={highlighted}
          showPhotos={showPhotos}
          colorOf={coloring.colorOf}
          store={preview}
          selected={selected}
          onTap={onTap}
        />
        <div className="stage-bottom" data-overlay="">
          {hint && selected === null && !phone && <RestHint store={preview} touch={touchOnly} />}
          {voteInView && voteView.status !== "none" && (
            <VoteHeader
              view={voteView}
              unplaced={pastSitting?.unplaced ?? 0}
              legend={coloring.key === VOTE}
              store={preview}
              selected={selected}
              onHover={hoverPosition}
            />
          )}
          {coloring.key !== VOTE && <Legend coloring={coloring} store={preview} selected={selected} onHover={hoverValue} />}
        </div>
        <div className="controls panel" data-obstacle="" data-overlay="">
          <FeaturePicker
            label="Disposition"
            features={features}
            vote={voteOption}
            selected={chartKey}
            onSelect={selectChart}
            noneLabel="Hémicycle"
          />
          <FeaturePicker label="Colorier par" features={features} vote={voteOption} selected={colorKey} onSelect={selectColoring} />
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
        <Reader store={preview} people={sitting.byId} coloring={coloring} onOpen={open} onStep={step} />
      ) : (
        <PreviewCard
          store={preview}
          people={sitting.byId}
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
          seat={assembly.byId.get(panelDeputy.id)?.seat}
          open={selected !== null}
          coloring={coloring}
          chart={chart}
          layoutBy={layoutBy}
          total={sitting.deputies.length}
          outOfView={panelOutOfView}
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
        loadVotes={votes.index}
        lookupSources={lookupSources}
        onHalo={preview.halo}
        onSelect={open}
        onAddress={openFromAddress}
        onVote={pickVote}
        onResults={setSearchResults}
      />
      <Footer />
    </div>
  )
}

function RestHint({ store, touch }: { store: PreviewStore; touch: boolean }) {
  const { target, card } = usePreview(store)
  const resting = target === null && !card?.visible
  return (
    <p className={resting ? "stage-hint" : "stage-hint masked"} data-obstacle={resting ? "" : undefined}>
      {touch
        ? "Touchez un point pour voir qui siège là · touchez à nouveau pour ouvrir sa fiche"
        : "Survolez un point pour voir qui siège là · cliquez pour ouvrir sa fiche"}
    </p>
  )
}

function outOfView(person: Person, sitting: Sitting, vote: ReadVote | null): string | null {
  if (vote !== null) return vote.reading.positions.has(person.id) ? null : `Ne siégeait pas le ${longDate(vote.vote.date)}`
  return sitting.byId.has(person.id) || person.in_office === "yes" ? null : "Ne siège plus"
}

function deputyInUrl(assembly: Assembly): DeputyId | null {
  const requested = readParam("deputy")
  return Array.from(assembly.people.keys()).find(id => id === requested) ?? null
}

function viewInUrl(features: readonly ColorableFeature[], initialColoring: FeatureColoring): View {
  const vote = voteId(readParam("vote") ?? "")
  const chartFeature = features.find(f => f.key === readParam("chart"))?.key ?? null
  if (vote === null) return { color: initialColoring.key, chart: chartFeature, vote }
  const chart = readParam("chart") === VOTE ? VOTE : chartFeature
  const color = readParam("color") === VOTE || chart !== VOTE ? VOTE : initialColoring.key
  return { color, chart, vote }
}

function writeView({ color, chart, vote }: View): void {
  writeParam("vote", color === VOTE || chart === VOTE ? vote : null)
  writeParam("color", color === DEFAULT_COLORING ? null : color)
  writeParam("chart", chart)
}

function isPanelHistoryEntry(state: unknown): boolean {
  return typeof state === "object" && state !== null && "panel" in state && state.panel === true
}

export async function loadInitialColoring(assembly: Assembly, store: FeatureStore): Promise<FeatureColoring> {
  const features = colorableFeatures(assembly, HIDDEN_FEATURES)
  const requested = readParam("color")
  const source = features.find(f => f.key === requested) ?? features.find(f => f.key === DEFAULT_COLORING)
  if (!source) throw new Error(`catalog.json: no feature ${DEFAULT_COLORING}`)
  return buildColoring(store, source, assembly.deputies)
}
