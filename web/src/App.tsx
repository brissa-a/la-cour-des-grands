import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AddressBlock } from "./address/AddressBlock.tsx"
import type { Located } from "./address/lookup.ts"
import { createLookupSources } from "./address/sources.ts"
import { rowCount } from "./data/catalog.ts"
import { loadCommunes, loadOfficialPages, type Assembly, type DeputyId, type Person, type Sitting } from "./data/assembly.ts"
import type { ColorableFeature } from "./data/features.ts"
import { viewBoxAttribute } from "./data/viewBox.ts"
import { fullSiteUrl, legendShown, type Chrome } from "./embed/chrome.ts"
import type { Order, Screen } from "./forms/form.ts"
import { arrange, FORMS, picksOf } from "./forms/registry.ts"
import { Stage } from "./layout/Stage.tsx"
import { Legend } from "./layout/Legend.tsx"
import { VoteHeader } from "./layout/VoteHeader.tsx"
import { VoteLine } from "./layout/VoteLine.tsx"
import type { MotionPreference } from "./layout/staging.ts"
import { useDrawing } from "./layout/useDrawing.ts"
import { useStageFrame } from "./layout/useStageFrame.ts"
import { useStaging } from "./layout/useStaging.ts"
import { useMediaQuery } from "./layout/useMediaQuery.ts"
import type { Paint } from "./paint/paint.ts"
import { colorWith, type Colored } from "./paint/registry.ts"
import { ConfigButton, ConfigPanel } from "./config/ConfigPanel.tsx"
import { useConfig } from "./config/useConfig.ts"
import { FeaturePanel } from "./panel/FeaturePanel.tsx"
import { PhoneDock } from "./panel/PhoneDock.tsx"
import { chosenOf, panelRows, type Offer } from "./panel/rows.ts"
import { besideSheet, toggled, type Side } from "./panel/side.ts"
import { useSheet } from "./panel/useSheet.ts"
import { chosenVote, cleared, initialState, pendingIntent, picked, pressed, type Press, type ViewState } from "./panel/viewState.ts"
import { composition } from "./panel/summary.ts"
import { hasOpenedPanel, rememberPanelOpened } from "./preview/firstUse.ts"
import { colorLine, layoutLine, layoutPlace } from "./preview/lines.ts"
import { step, type Direction } from "./preview/neighbours.ts"
import { PreviewCard } from "./preview/PreviewCard.tsx"
import { cardShown, createPreviewStore, usePreview, type Hit, type PreviewStore } from "./preview/previewStore.ts"
import { DeputyPanel } from "./profile/DeputyPanel.tsx"
import { longDate } from "./profile/format.ts"
import { Search } from "./search/Search.tsx"
import { Footer } from "./Footer.tsx"
import { voteParts } from "./sources/parts.ts"
import { readingOf } from "./sources/read.ts"
import type { Source } from "./sources/shapes.ts"
import { seatsOf } from "./sources/seats.ts"
import { featuresOf, useFeatureValues } from "./sources/useFeatureValues.ts"
import type { FeatureCache } from "./sources/values.ts"
import { DEFAULT_COLOR_FEATURE, PANEL_ORDER } from "./sources/views.ts"
import { pushParam, readParam, writeParam, writeParams, type Param } from "./url.ts"
import { HEMICYCLE, readsVote, viewParams, type ParsedView, type View } from "./view/view.ts"
import type { VotePosition } from "./votes/positions.ts"
import { sittingOn } from "./votes/sitting.ts"
import { voteFinder } from "./votes/voteSearch.ts"
import { createVoteSource, type ReadVote } from "./votes/sources.ts"
import { shownVote, useVoteView } from "./votes/useVoteView.ts"
import { VOTES_FILE, type Vote } from "./votes/votes.ts"

const NO_IDS: ReadonlySet<DeputyId> = new Set()
const NO_FEATURES: readonly ColorableFeature[] = []
const PANEL_HISTORY_STATE = { panel: true }
const PHONE = "(max-width: 759px)"
// Below this width the side panel and the deputy sheet together would leave the drawing under 480 px.
const CROWDED = "(max-width: 1159px)"
const TOUCH_ONLY = "(hover: none)"
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

type Props = { assembly: Assembly; features: readonly ColorableFeature[]; cache: FeatureCache; initial: ParsedView; chrome: Chrome }

export function App({ assembly, features, cache, initial, chrome }: Props) {
  const votes = useMemo(() => createVoteSource(assembly.catalog, assembly.people), [assembly])
  const finder = useMemo(() => voteFinder(votes.index), [votes])
  const voteCount = rowCount(assembly.catalog, VOTES_FILE)
  const [panel, setPanel] = useState(() => initialState(initial))
  const { view, fallback: fallbackColor } = panel
  const remembered = chosenVote(panel)
  const pending = pendingIntent(panel)
  const voteView = useVoteView(votes, remembered)
  const voteInView = view.scrutin !== null
  const { read: readVote, settled } = shownVote(voteView)
  const pastSitting = useMemo(() => readVote && sittingOn(assembly, readVote.reading.roster), [assembly, readVote])
  const sitting: Sitting = voteInView && pastSitting ? pastSitting : assembly
  const drawn = useMemo(() => sitting.deputies.map(deputy => deputy.id), [sitting])
  const seats = useMemo(() => seatsOf(sitting, assembly.background), [sitting, assembly])
  const vote = voteInView ? readVote : null

  const colorValues = useFeatureValues(cache, featuresOf([view.color.of]))
  const fallbackValues = useFeatureValues(cache, featuresOf([fallbackColor.of]))
  const layoutValues = useFeatureValues(cache, featuresOf(picksOf(view.layout)))
  const panelValues = useFeatureValues(cache, chrome.kind === "full" ? features : NO_FEATURES)
  const chosenColored = useMemo(
    () => colorWith(view.color, source => readingOf(source, { drawn, values: colorValues, vote, seats })),
    [view.color, drawn, colorValues, vote, seats],
  )
  const fallbackColored = useMemo(
    () => colorWith(fallbackColor, source => readingOf(source, { drawn, values: fallbackValues, vote, seats })),
    [fallbackColor, drawn, fallbackValues, vote, seats],
  )
  const lastPlainColored = useRef<Colored | null>(null)
  const lastColored = useRef<Colored | null>(null)
  const held = settled || !readsVote(view.color) ? null : lastColored.current
  const colored = held ?? chosenColored ?? fallbackColored ?? lastPlainColored.current
  lastColored.current = colored
  if (colored && colored.reading.source.kind !== "vote") lastPlainColored.current = colored

  const previewOptions = useConfig(config => config.preview)
  const [preview] = useState(() => createPreviewStore(previewOptions))
  const [selected, setSelected] = useState<DeputyId | null>(() => (chrome.kind === "full" ? deputyInUrl(assembly) : null))
  const [pinned] = useState(() => (chrome.kind === "clean" ? deputyInUrl(assembly) : null))
  const ringed = selected ?? pinned
  const [panelId, setPanelId] = useState<DeputyId | null>(selected)
  const [hint, setHint] = useState(() => !hasOpenedPanel())
  const [searchResults, setSearchResults] = useState(NO_IDS)
  const [hovered, setHovered] = useState<readonly DeputyId[] | null>(null)
  const [showPhotos, setShowPhotos] = useState(() => readParam("showPic") === "true")
  const [officialPages, setOfficialPages] = useState<ReadonlyMap<DeputyId, string>>(new Map())
  const [configOpen, setConfigOpen] = useState(false)
  const lookupSources = useMemo(() => createLookupSources(assembly.catalog), [assembly])
  const [addressContext, setAddressContext] = useState<Located | null>(null)
  const narrow = useMediaQuery(PHONE)
  const screen: Screen = narrow ? "phone" : "desktop"
  const phone = chrome.kind === "full" && narrow
  const touchOnly = useMediaQuery(TOUCH_ONLY)
  const crowded = useMediaQuery(CROWDED)
  const motion: MotionPreference = useMediaQuery(REDUCED_MOTION) ? "reduced" : "full"
  const [voteMissing, setVoteMissing] = useState(false)
  const sheetOpen = selected !== null
  const [side, setSide] = useState<Side>(() => besideSheet("open", sheetOpen, crowded))
  const [viewSheet, onViewSheet] = useSheet()
  const svgRef = useRef<SVGSVGElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const frame = useStageFrame(svgRef, screen)

  const order = useMemo(() => (settled && chosenColored ? rankThenName(chosenColored.paint, sitting) : null), [settled, chosenColored, sitting])
  const arrangement = useMemo(
    () => order && arrange(view.layout, source => readingOf(source, { drawn, values: layoutValues, vote, seats }), order),
    [view.layout, order, drawn, layoutValues, vote, seats],
  )
  const staged = useStaging(arrangement, frame, seats, drawn)
  useDrawing(
    {
      vote: voteMissing ? "missing" : voteInView ? voteView.status : "none",
      valuesFailed: featuresOf([view.color.of, ...picksOf(view.layout)]).some(cache.failed),
      color: { wanted: chosenColored, shown: colored },
      arrangement: { wanted: arrangement, shown: staged.arrangement },
      measured: frame !== null,
      motion,
    },
    [staged.scene, colored?.paint],
  )

  useEffect(() => {
    if (chrome.kind === "full") loadOfficialPages().then(setOfficialPages, (error: unknown) => console.error(error))
  }, [chrome])

  useEffect(() => preview.configure(previewOptions), [preview, previewOptions])

  useEffect(() => {
    if (chrome.kind === "full") {
      if (isPanelHistoryEntry(history.state)) history.replaceState(null, "")
      if (readParam("deputy") !== null && selected === null) writeParam("deputy", null)
    }
    writeUrl(initial.view)
  }, [])

  useEffect(() => {
    if (voteView.status !== "missing") return
    update(cleared(panel))
    setVoteMissing(true)
  }, [voteView.status])

  useEffect(() => setSide(current => besideSheet(current, sheetOpen, crowded)), [sheetOpen, crowded])

  useEffect(() => {
    if (sheetOpen || !phone) onViewSheet({ kind: "close" })
  }, [sheetOpen, phone, onViewSheet])

  const update = (next: ViewState) => {
    setVoteMissing(false)
    setPanel(next)
    writeUrl(next.view)
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

  const openSite = (id: DeputyId) => {
    window.open(fullSiteUrl(location.href, urlParams(view, showPhotos), id), "_blank", "noopener")
  }

  const openDeputy = chrome.kind === "clean" ? openSite : open

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

  const pickVote = (vote: Vote) => update(picked(panel, vote.id))

  const clearVote = () => update(cleared(panel))

  const pressOffer = (offer: Offer): Press => {
    const { state, press } = pressed(panel, offer)
    update(state)
    return press
  }

  useEffect(() => {
    if (chrome.kind === "clean") return
    const onPopState = () => {
      const id = deputyInUrl(assembly)
      setSelected(id)
      if (id) setPanelId(id)
      else setAddressContext(null)
      writeParams(urlParams(view, showPhotos))
    }
    addEventListener("popstate", onPopState)
    return () => removeEventListener("popstate", onPopState)
  }, [chrome, assembly, view, showPhotos])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (e.target instanceof HTMLInputElement && e.target.type === "search") return
      if (viewSheet.kind !== "closed") onViewSheet({ kind: "close" })
      else if (!phone && cardShown(preview.get().card, selected)) preview.dismiss()
      else close()
    }
    addEventListener("keydown", onKeyDown)
    return () => removeEventListener("keydown", onKeyDown)
  })

  const onTap = (hit: Hit | null, pointerType: string) => {
    const shown = cardShown(preview.get().card, selected)
    if (phone) {
      onViewSheet({ kind: "close" })
      if (!hit) close()
      else {
        preview.show(hit.id, null)
        if (selected !== null) open(hit.id)
      }
    } else if (pointerType !== "touch") {
      if (hit) openDeputy(hit.id)
      else close()
    } else if (hit) {
      if (shown && preview.get().card?.id === hit.id) openDeputy(hit.id)
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

  const chosen = useMemo(() => chosenOf(remembered, readVote), [remembered, readVote])
  const panelRead = useCallback(
    (source: Source) => readingOf(source, { drawn, values: panelValues, vote, seats }),
    [drawn, panelValues, vote, seats],
  )
  const rows = useMemo(
    () => panelRows({ features, order: PANEL_ORDER, reading: panelRead, chosen, votes: voteCount }),
    [features, panelRead, chosen, voteCount],
  )

  if (colored === null) return null

  const panelDeputy = panelId === null ? undefined : (sitting.byId.get(panelId) ?? assembly.people.get(panelId))
  const panelOutOfView = panelDeputy === undefined ? null : outOfView(panelDeputy, sitting, vote)
  const colorsVote = colored.reading.source.kind === "vote"
  const layoutGlyph = FORMS[staged.arrangement?.form ?? HEMICYCLE.form].glyph
  const folded = side !== "open"
  const searchingVote = phone && viewSheet.kind === "searching"
  const classes = ["app", selected && "panel-open", !phone && folded && "side-folded", phone && viewSheet.kind !== "closed" && "sheet-open"].filter(Boolean).join(" ")
  const pastComposition = vote && pastSitting ? composition(vote.vote.date, pastSitting.emptySeats.length) : null
  const voteHeader = (docked: boolean) =>
    voteInView &&
    voteView.status !== "none" && (
      <VoteHeader
        view={voteView}
        unplaced={pastSitting?.unplaced ?? 0}
        legend={colorsVote}
        docked={docked}
        store={preview}
        selected={selected}
        onHover={hoverPosition}
      />
    )
  const photosAndConfig = (
    <div className="control-row">
      <label className="control">
        <input type="checkbox" checked={showPhotos} onChange={togglePhotos} /> Afficher les photos
      </label>
      <ConfigButton open={configOpen} onToggle={toggleConfig} />
    </div>
  )
  const search = (
    <Search
      assembly={assembly}
      loadCommunes={loadCommunes}
      findVotes={finder}
      lookupSources={lookupSources}
      onHalo={preview.halo}
      onSelect={open}
      onAddress={openFromAddress}
      onVote={pickVote}
      onResults={setSearchResults}
      inputRef={searchInput}
      inert={searchingVote}
    />
  )
  const stage = (
    <Stage
      svgRef={svgRef}
      viewBox={viewBoxAttribute(assembly.background.box)}
      deputies={sitting.deputies}
      scene={staged.scene}
      arrangement={staged.arrangement ?? staged.reading}
      highlighted={highlighted}
      showPhotos={showPhotos}
      colorOf={colored.paint.colorOf}
      store={preview}
      selected={ringed}
      zoomable={chrome.kind === "full"}
      motion={motion}
      onTap={onTap}
    />
  )
  const legend = legendShown(chrome, colored.reading.source, view.layout) && (
    <Legend paint={colored.paint} store={preview} selected={ringed} onHover={setHovered} />
  )
  const card = (
    <PreviewCard
      store={preview}
      people={sitting.byId}
      lines={cardLines}
      layoutGlyph={layoutGlyph}
      selected={selected}
      hint={chrome.kind === "clean" || hint}
      touch={touchOnly}
      opens={chrome.kind === "clean" ? "site" : "panel"}
      onOpen={openDeputy}
    />
  )

  if (chrome.kind === "clean")
    return (
      <div className="app">
        <main className="stage">
          {chrome.title && voteInView && voteView.status !== "none" && <VoteLine view={voteView} />}
          {stage}
          <div className="stage-bottom">
            {legend}
            <a className="site-link" href={fullSiteUrl(location.href, urlParams(view, showPhotos), null)} target="_blank" rel="noopener">
              La cour des grands ↗
            </a>
          </div>
        </main>
        {card}
      </div>
    )

  return (
    <div className={classes}>
      {!phone && (
        <FeaturePanel
          view={view}
          rows={rows}
          chosen={chosen}
          pending={pending}
          folded={folded}
          composition={pastComposition}
          read={panelRead}
          search={search}
          searchInput={searchInput}
          voteDetails={!folded && voteHeader(true)}
          bottom={photosAndConfig}
          finder={finder}
          voteCount={voteCount}
          onPress={pressOffer}
          onPickVote={pickVote}
          onClearVote={clearVote}
          onFold={() => setSide(toggled)}
        />
      )}
      <main className="stage" inert={searchingVote}>
        {stage}
        <div className="stage-bottom" data-overlay="">
          {hint && selected === null && !phone && <RestHint store={preview} touch={touchOnly} />}
          {(phone || folded) && voteHeader(false)}
          {legend}
        </div>
      </main>
      {phone ? (
        <PhoneDock
          view={view}
          rows={rows}
          chosen={chosen}
          pending={pending}
          sheet={viewSheet}
          composition={pastComposition}
          read={panelRead}
          voteDetails={voteHeader(true)}
          bottom={photosAndConfig}
          finder={finder}
          voteCount={voteCount}
          store={preview}
          people={sitting.byId}
          readerLine={readerLine}
          onSheet={onViewSheet}
          onPress={pressOffer}
          onPickVote={pickVote}
          onClearVote={clearVote}
          onOpenDeputy={open}
          onStep={stepFrom}
        />
      ) : card}
      {configOpen && <ConfigPanel onClose={closeConfig} />}
      {panelDeputy && (
        <DeputyPanel
          deputy={panelDeputy}
          seat={(sitting.byId.get(panelDeputy.id) ?? assembly.byId.get(panelDeputy.id))?.seat}
          open={selected !== null}
          colored={colored}
          place={layoutPlace(staged.reading, colored, staged.scene.where(panelDeputy.id))}
          layoutGlyph={layoutGlyph}
          total={sitting.deputies.length}
          outOfView={panelOutOfView}
          officialPage={officialPages.get(panelDeputy.id)}
          address={
            addressContext && <AddressBlock located={addressContext} deputy={panelDeputy} assembly={assembly} onOpen={show} />
          }
          onClose={close}
        />
      )}
      {phone && search}
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

function rankThenName({ rank }: Paint, sitting: Sitting): Order {
  const name = (id: DeputyId) => sitting.byId.get(id)?.last_name ?? ""
  return (a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b))
}

function writeUrl(view: View): void {
  writeParams(viewParams(view, DEFAULT_COLOR_FEATURE))
}

function urlParams(view: View, showPhotos: boolean): readonly Param[] {
  return [...viewParams(view, DEFAULT_COLOR_FEATURE), ["showPic", showPhotos ? "true" : null]]
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
