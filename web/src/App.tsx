import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AddressBlock } from "./address/AddressBlock.tsx"
import type { Located } from "./address/lookup.ts"
import { createLookupSources } from "./address/sources.ts"
import { loadCommunes, loadOfficialPages, type Assembly, type DeputyId, type Person, type Sitting } from "./data/assembly.ts"
import type { ColorableFeature } from "./data/features.ts"
import type { Order, Scene } from "./forms/form.ts"
import { placeHemicycle } from "./forms/hemicycle.ts"
import { layOut } from "./forms/registry.ts"
import { Stage } from "./layout/Stage.tsx"
import { Legend } from "./layout/Legend.tsx"
import { VoteHeader } from "./layout/VoteHeader.tsx"
import { useStageFrame } from "./layout/useStageFrame.ts"
import { useMediaQuery } from "./layout/useMediaQuery.ts"
import type { Paint } from "./paint/paint.ts"
import { paintWith } from "./paint/registry.ts"
import { ConfigButton, ConfigPanel } from "./config/ConfigPanel.tsx"
import { useConfig } from "./config/useConfig.ts"
import { hasOpenedPanel, rememberPanelOpened } from "./preview/firstUse.ts"
import { colorLine, layoutLine, layoutPlace, type Colored } from "./preview/lines.ts"
import { step, type Direction } from "./preview/neighbours.ts"
import { PreviewCard } from "./preview/PreviewCard.tsx"
import { cardShown, createPreviewStore, usePreview, type Hit, type PreviewStore } from "./preview/previewStore.ts"
import { Reader } from "./preview/Reader.tsx"
import { DeputyPanel } from "./profile/DeputyPanel.tsx"
import { longDate } from "./profile/format.ts"
import { Search } from "./search/Search.tsx"
import { Footer } from "./Footer.tsx"
import { voteParts } from "./sources/parts.ts"
import { readingOf, readSeats } from "./sources/read.ts"
import { seatsOf } from "./sources/seats.ts"
import type { Data, Reading } from "./sources/shapes.ts"
import { featureOf, useFeatureValues } from "./sources/useFeatureValues.ts"
import type { FeatureCache } from "./sources/values.ts"
import { DEFAULT_COLOR_FEATURE } from "./sources/views.ts"
import { pushParam, readParam, writeParam } from "./url.ts"
import { colorId, colorOptions, layoutId, layoutOptions } from "./view/options.ts"
import { Picker } from "./view/Picker.tsx"
import { HEMICYCLE, readsVote, viewOf, VOTE_COLOR, writeView, type ParsedView, type View } from "./view/view.ts"
import type { VotePosition } from "./votes/positions.ts"
import { sittingOn } from "./votes/sitting.ts"
import { createVoteSource, type ReadVote } from "./votes/sources.ts"
import { useVoteView } from "./votes/useVoteView.ts"
import type { Vote } from "./votes/votes.ts"

const NO_IDS: ReadonlySet<DeputyId> = new Set()
const PANEL_HISTORY_STATE = { panel: true }
const PHONE = "(max-width: 759px)"
const TOUCH_ONLY = "(hover: none)"

type Props = { assembly: Assembly; features: readonly ColorableFeature[]; cache: FeatureCache; initial: ParsedView }

type Staged = { scene: Scene; reading: Reading }

export function App({ assembly, features, cache, initial }: Props) {
  const votes = useMemo(() => createVoteSource(assembly.catalog, assembly.people), [assembly])
  const [view, setView] = useState(initial.view)
  const [fallbackColor, setFallbackColor] = useState(initial.fallback)
  const [remembered, setRemembered] = useState(initial.view.scrutin)
  const voteView = useVoteView(votes, remembered)
  const voteInView = view.scrutin !== null
  const readVote = (voteView.status === "loading" ? voteView.previous : voteView.status === "ready" ? voteView : null)?.read ?? null
  const pastSitting = useMemo(() => readVote && sittingOn(assembly, readVote.reading.roster), [assembly, readVote])
  const sitting: Sitting = voteInView && pastSitting ? pastSitting : assembly
  const drawn = useMemo(() => sitting.deputies.map(deputy => deputy.id), [sitting])
  const seats = useMemo(() => seatsOf(sitting, assembly.background), [sitting, assembly])
  const vote = voteInView ? readVote : null

  const colorValues = useFeatureValues(cache, featureOf(view.color.of))
  const fallbackValues = useFeatureValues(cache, featureOf(fallbackColor.of))
  const layoutValues = useFeatureValues(cache, featureOf(view.layout.of))
  const colorReading = useMemo(
    () => readingOf(view.color.of, { drawn, values: colorValues, vote, seats }),
    [view.color.of, drawn, colorValues, vote, seats],
  )
  const fallbackReading = useMemo(
    () => readingOf(fallbackColor.of, { drawn, values: fallbackValues, vote, seats }),
    [fallbackColor.of, drawn, fallbackValues, vote, seats],
  )
  const layoutReading = useMemo(
    () => readingOf(view.layout.of, { drawn, values: layoutValues, vote, seats }),
    [view.layout.of, drawn, layoutValues, vote, seats],
  )

  const lastColored = useRef<Colored | null>(null)
  const colored = useMemo(() => {
    const ready = colorReading ?? fallbackReading
    const painter = colorReading ? view.color : fallbackColor
    const paint = ready && paintWith(painter.paint, dataOf(ready))
    return ready && paint ? { reading: ready, paint } : lastColored.current
  }, [colorReading, fallbackReading, view.color, fallbackColor])
  if (colored) lastColored.current = colored

  const previewOptions = useConfig(config => config.preview)
  const [preview] = useState(() => createPreviewStore(previewOptions))
  const [selected, setSelected] = useState<DeputyId | null>(() => deputyInUrl(assembly))
  const [panelId, setPanelId] = useState<DeputyId | null>(selected)
  const [hint, setHint] = useState(() => !hasOpenedPanel())
  const [searchResults, setSearchResults] = useState(NO_IDS)
  const [hovered, setHovered] = useState<readonly DeputyId[] | null>(null)
  const [showPhotos, setShowPhotos] = useState(() => readParam("showPic") === "true")
  const [officialPages, setOfficialPages] = useState<ReadonlyMap<DeputyId, string>>(new Map())
  const [configOpen, setConfigOpen] = useState(false)
  const lookupSources = useMemo(() => createLookupSources(assembly.catalog), [assembly])
  const [addressContext, setAddressContext] = useState<Located | null>(null)
  const phone = useMediaQuery(PHONE)
  const touchOnly = useMediaQuery(TOUCH_ONLY)
  const svgRef = useRef<SVGSVGElement>(null)
  const frame = useStageFrame(svgRef)

  const order = useMemo(() => colored && rankThenName(colored.paint, sitting), [colored, sitting])
  const room = useMemo(() => ({ scene: placeHemicycle(seats), reading: readSeats(seats) }), [seats])
  const staged: Staged = useMemo(() => {
    if (!layoutReading || !frame || !order) return room
    const scene = layOut(view.layout.form, dataOf(layoutReading), { frame, order })
    return scene ? { scene, reading: layoutReading } : room
  }, [layoutReading, frame, order, view.layout.form, room])

  useEffect(() => {
    loadOfficialPages().then(setOfficialPages, (error: unknown) => console.error(error))
  }, [])

  useEffect(() => preview.configure(previewOptions), [preview, previewOptions])

  useEffect(() => {
    if (isPanelHistoryEntry(history.state)) history.replaceState(null, "")
    if (readParam("deputy") !== null && selected === null) writeParam("deputy", null)
    writeUrl(initial.view)
  }, [])

  useEffect(() => {
    if (voteView.status !== "missing") return
    const next = viewOf(readsVote(view.color) ? fallbackColor : view.color, readsVote(view.layout) ? HEMICYCLE : view.layout, null)
    if (next) change(next)
    setRemembered(null)
  }, [voteView.status])

  const change = (next: View) => {
    setView(next)
    writeUrl(next)
  }

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

  const selectColor = (choice: View["color"]) => {
    const next = viewOf(choice, view.layout, remembered)
    if (next === null) return
    if (!readsVote(choice)) setFallbackColor(choice)
    change(next)
  }

  const selectLayout = (choice: View["layout"]) => {
    const next = viewOf(view.color, choice, remembered)
    if (next) change(next)
  }

  const pickVote = (picked: Vote) => {
    setRemembered(picked.id)
    const next = viewOf(VOTE_COLOR, view.layout, picked.id)
    if (next) change(next)
  }

  useEffect(() => {
    const onPopState = () => {
      const id = deputyInUrl(assembly)
      setSelected(id)
      if (id) setPanelId(id)
      else setAddressContext(null)
      writeUrl(view)
      writeParam("showPic", showPhotos ? "true" : null)
    }
    addEventListener("popstate", onPopState)
    return () => removeEventListener("popstate", onPopState)
  }, [assembly, view, showPhotos])

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

  const stepFrom = (from: DeputyId, direction: Direction) => {
    const next = step(staged.scene.lines, from, direction)
    if (next) preview.show(next, null)
  }

  const highlighted = useMemo(() => (hovered === null ? searchResults : new Set([...searchResults, ...hovered])), [searchResults, hovered])

  const votePartsNow = useMemo(() => vote && voteParts(vote, drawn), [vote, drawn])
  const hoverPosition = (position: VotePosition | null) =>
    setHovered(position === null ? null : (votePartsNow?.parts.find(part => part.key === position)?.members ?? null))

  const cardLines = useCallback(
    (id: DeputyId) => ({
      color: colored && colorLine(colored, id),
      layout: colored && layoutLine(staged.reading, colored, id),
    }),
    [colored, staged],
  )
  const readerLine = useCallback((id: DeputyId) => colored && colorLine(colored, id), [colored])

  const toggleConfig = () => {
    if (!configOpen) preview.halo(null)
    setConfigOpen(!configOpen)
  }

  const closeConfig = useCallback(() => setConfigOpen(false), [])

  const togglePhotos = () => {
    setShowPhotos(!showPhotos)
    writeParam("showPic", showPhotos ? null : "true")
  }

  if (colored === null) return null

  const panelDeputy = panelId === null ? undefined : (sitting.byId.get(panelId) ?? assembly.people.get(panelId))
  const panelOutOfView = panelDeputy === undefined ? null : outOfView(panelDeputy, sitting, vote)
  const voteOption = remembered === null ? null : readVote?.vote.id === remembered ? `Scrutin n° ${readVote.vote.number}` : "Scrutin"
  const colorsVote = colored.reading.source.kind === "vote"

  return (
    <div className={selected ? "app panel-open" : "app"}>
      <main className="stage">
        <Stage
          svgRef={svgRef}
          viewBox={assembly.background.viewBox}
          deputies={sitting.deputies}
          scene={staged.scene}
          highlighted={highlighted}
          showPhotos={showPhotos}
          colorOf={colored.paint.colorOf}
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
              legend={colorsVote}
              store={preview}
              selected={selected}
              onHover={hoverPosition}
            />
          )}
          {!colorsVote && <Legend paint={colored.paint} store={preview} selected={selected} onHover={setHovered} />}
        </div>
        <div className="controls panel" data-obstacle="" data-overlay="">
          <Picker label="Disposition" options={layoutOptions(features, voteOption)} selected={layoutId(view.layout)} onSelect={selectLayout} />
          <Picker label="Colorier par" options={colorOptions(features, voteOption)} selected={colorId(view.color)} onSelect={selectColor} />
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
        <Reader store={preview} people={sitting.byId} colorLine={readerLine} onOpen={open} onStep={stepFrom} />
      ) : (
        <PreviewCard
          store={preview}
          people={sitting.byId}
          lines={cardLines}
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
          colored={colored}
          place={layoutPlace(staged.reading, colored, staged.scene.where(panelDeputy.id))}
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

function dataOf(reading: Reading): Partial<Data> {
  return reading.data
}

function rankThenName({ rank }: Paint, sitting: Sitting): Order {
  const name = (id: DeputyId) => sitting.byId.get(id)?.last_name ?? ""
  return (a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b))
}

function writeUrl(view: View): void {
  writeView(view, writeParam, DEFAULT_COLOR_FEATURE)
}

function outOfView(person: Person, sitting: Sitting, vote: ReadVote | null): string | null {
  if (vote !== null) return vote.reading.positions.has(person.id) ? null : `Ne siégeait pas le ${longDate(vote.vote.date)}`
  return sitting.byId.has(person.id) || person.in_office === "yes" ? null : "Ne siège plus"
}

function deputyInUrl(assembly: Assembly): DeputyId | null {
  const requested = readParam("deputy")
  return Array.from(assembly.people.keys()).find(id => id === requested) ?? null
}

function isPanelHistoryEntry(state: unknown): boolean {
  return typeof state === "object" && state !== null && "panel" in state && state.panel === true
}
