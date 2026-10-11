import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"
import type { DeputyId, Person } from "../data/assembly.ts"
import { GlyphIcon } from "../glyph/GlyphIcon.tsx"
import type { ColorLine } from "../preview/lines.ts"
import type { Direction } from "../preview/neighbours.ts"
import { usePreview, type PreviewStore } from "../preview/previewStore.ts"
import { Reader } from "../preview/Reader.tsx"
import type { Reading, Source } from "../sources/shapes.ts"
import type { View } from "../view/view.ts"
import type { VoteFinder } from "../votes/voteSearch.ts"
import type { Vote } from "../votes/votes.ts"
import { activeRowScroll, tabsOf, type Tabs } from "./bar.ts"
import { Chevron, CloseIcon, GlyphButton, RowHead, SummaryLine } from "./PanelParts.tsx"
import { choiceKey, greyedReason, holds, offerLabel, pressed, rowHint, rowSubject, unfoldedRow, type ChosenVote, type Offer, type Row, type VoteRow } from "./rows.ts"
import type { Sheet, SheetEvent } from "./sheet.ts"
import { sentenceText, summary, type Sentence } from "./summary.ts"
import { VoteChosen, VoteIdle } from "./VotePicker.tsx"
import { VoteSearchScreen } from "./VoteSearchScreen.tsx"
import { waitsFor, type Intent, type Press } from "./viewState.ts"

type Props = {
  view: View
  rows: readonly Row[]
  chosen: ChosenVote | null
  pending: Intent | null
  sheet: Sheet
  composition: string | null
  read: (source: Source) => Reading | null
  voteDetails: ReactNode
  bottom: ReactNode
  finder: () => Promise<VoteFinder>
  voteCount: number | null
  store: PreviewStore
  people: ReadonlyMap<DeputyId, Person>
  readerLine: (id: DeputyId) => ColorLine | null
  onSheet: (event: SheetEvent) => void
  onPress: (offer: Offer) => Press
  onPickVote: (vote: Vote) => void
  onClearVote: () => void
  onOpenDeputy: (id: DeputyId) => void
  onStep: (from: DeputyId, direction: Direction) => void
}

export function PhoneDock(props: Props) {
  const { sheet, finder, voteCount, pending, onSheet, onPickVote } = props
  const searched = () => onSheet({ kind: "searched" })
  return (
    <>
      {sheet.kind === "closed" ? <Bar {...props} /> : <ViewSheet {...props} />}
      {sheet.kind === "searching" && (
        <VoteSearchScreen
          finder={finder}
          count={voteCount}
          pending={pending}
          onPick={vote => {
            onPickVote(vote)
            searched()
          }}
          onBack={searched}
        />
      )}
    </>
  )
}

function Bar({ view, rows, chosen, store, people, readerLine, onSheet, onPress, onOpenDeputy, onStep }: Props) {
  const { card } = usePreview(store)
  const deputy = card ? people.get(card.id) : undefined
  const tabs = tabsOf(rows, view)
  const [color, layout] = summary(view, chosen)
  const label = `Ouvrir les réglages de la vue · ${sentenceText(color)} · ${sentenceText(layout)}`
  const open = () => onSheet({ kind: "open" })
  const opener = (
    <button type="button" className="icon-button bar-open" onClick={open} aria-haspopup="dialog" aria-expanded={false} aria-label={label} title={label}>
      <Chevron towards="up" />
    </button>
  )
  const below = tabs ? (
    <BarTabs tabs={tabs} view={view} opener={deputy ? opener : null} onPress={onPress} />
  ) : deputy ? (
    <button type="button" className="bar-compact" onClick={open} aria-haspopup="dialog" aria-expanded={false} aria-label={label}>
      <CompactSentence sentence={color} />
      <CompactSentence sentence={layout} />
      <Chevron towards="up" />
    </button>
  ) : (
    <TouchHint />
  )
  return (
    <div className="dock">
      <span className="dock-handle" aria-hidden="true" />
      {deputy ? (
        <Reader deputy={deputy} colorLine={readerLine} onOpen={onOpenDeputy} onStep={onStep} />
      ) : (
        <button type="button" className="bar-summary" onClick={open} aria-haspopup="dialog" aria-expanded={false} aria-label={label}>
          <span className="bar-lines">
            <SummaryLine sentence={color} />
            <SummaryLine sentence={layout} />
          </span>
          <span className="bar-chevron">
            <Chevron towards="up" />
          </span>
        </button>
      )}
      {below}
    </div>
  )
}

type TabsProps = { tabs: Tabs; view: View; opener: ReactNode; onPress: (offer: Offer) => Press }

function BarTabs({ tabs, view, opener, onPress }: TabsProps) {
  return (
    <span className="bar-tabs" role="group" aria-label={`${rowSubject(tabs.row)} · disposition`}>
      {tabs.offers.map(offer => (
        <button
          key={choiceKey(offer.choice)}
          type="button"
          className="bar-tab"
          aria-pressed={pressed(view, offer)}
          aria-label={offerLabel(tabs.row, offer)}
          onClick={() => onPress(offer)}
        >
          <GlyphIcon glyph={offer.glyph} size={22} />
          <span>{offer.label}</span>
        </button>
      ))}
      {opener}
    </span>
  )
}

function CompactSentence({ sentence }: { sentence: Sentence }) {
  return (
    <span className="compact-sentence">
      <GlyphIcon glyph={sentence.glyph} size={20} className="summary-glyph" />
      <span className="summary-subject">{sentence.subject}</span>
    </span>
  )
}

function TouchHint() {
  return (
    <p className="bar-hint">
      <span className="reader-placeholder" aria-hidden="true" />
      <span>
        <span className="reader-title">Touchez un point pour voir qui siège là.</span>
        <span className="reader-subtitle">Touchez ensuite sa carte pour ouvrir sa fiche.</span>
      </span>
    </p>
  )
}

function ViewSheet(props: Props) {
  const { view, rows, chosen, sheet, composition, bottom, onSheet, onPress } = props
  const self = useRef<HTMLElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const active = useRef<HTMLLIElement>(null)
  const voteHead = useRef<HTMLButtonElement>(null)
  const searching = sheet.kind === "searching"
  const wasSearching = useRef(searching)
  const activeKey = unfoldedRow(view)
  const [color, layout] = summary(view, chosen)

  useLayoutEffect(() => {
    const row = active.current
    const scroller = list.current
    if (searching || !row || !scroller) return
    scroller.scrollTop = activeRowScroll({ top: row.offsetTop, height: row.offsetHeight }, scroller.clientHeight)
  }, [searching])

  useEffect(() => self.current?.focus({ preventScroll: true }), [])

  useEffect(() => {
    if (wasSearching.current && !searching) voteHead.current?.focus()
    wasSearching.current = searching
  }, [searching])

  const press = (offer: Offer) => onSheet({ kind: "pressed", offer, press: onPress(offer) })

  return (
    <section ref={self} className="sheet" role="dialog" aria-label="Réglages de la vue" tabIndex={-1} inert={searching}>
      <span className="dock-handle" aria-hidden="true" />
      <div className="sheet-head">
        <div className="sheet-summary" role="status" aria-label="Vue actuelle">
          <SummaryLine sentence={color} />
          <SummaryLine sentence={layout} />
          {composition && <span className="summary-note">{composition}</span>}
        </div>
        <button type="button" className="icon-button sheet-close" onClick={() => onSheet({ kind: "close" })} aria-label="Fermer les réglages de la vue">
          <CloseIcon size={20} />
        </button>
      </div>
      <div className="cell-captions" aria-hidden="true">
        <span className="cell-color">couleur</span>
        <span className="cell-layout">disposition</span>
      </div>
      <ul ref={list} className="feature-rows sheet-rows" aria-label="Caractéristiques">
        {rows.map(row => (
          <SheetRow key={row.key} {...props} row={row} active={row.key === activeKey ? active : null} voteHead={voteHead} onPress={press} />
        ))}
      </ul>
      <div className="sheet-bottom">{bottom}</div>
    </section>
  )
}

type RowProps = Omit<Props, "onPress"> & {
  row: Row
  active: RefObject<HTMLLIElement | null> | null
  voteHead: RefObject<HTMLButtonElement | null>
  onPress: (offer: Offer) => void
}

function SheetRow({ row, view, pending, active, voteHead, read, voteDetails, onPress, onSheet, onClearVote }: RowProps) {
  const labelled = active !== null
  const held = holds(view, row)
  const hintText = rowHint(view, row, read)
  const glyph = (offer: Offer) => (
    <GlyphButton
      key={choiceKey(offer.choice)}
      offer={offer}
      label={offerLabel(row, offer)}
      pressed={pressed(view, offer)}
      greyed={greyedReason(row)}
      waiting={waitsFor(pending, offer)}
      labelled={labelled}
      size={labelled ? 20 : 24}
      onPress={onPress}
    />
  )
  const cell = (channel: "color" | "layout") => `cell cell-${channel}${labelled ? " labelled" : ""}`
  const classes = ["feature-row", held.length > 0 && "held", labelled && "unfolded"].filter(Boolean).join(" ")
  return (
    <li ref={active} className={classes}>
      {row.kind === "vote" ? <VoteHead row={row} head={voteHead} onSearch={() => onSheet({ kind: "search" })} onClear={onClearVote} /> : <RowHead row={row} />}
      <span className="row-cells">
        <span className={cell("color")} role="group" aria-label={`${rowSubject(row)} · couleur`}>
          {row.color.map(glyph)}
        </span>
        <span className={cell("layout")} role="group" aria-label={`${rowSubject(row)} · disposition`}>
          {row.layout.map(glyph)}
        </span>
      </span>
      {hintText && <p className="row-hint">{hintText}</p>}
      {row.kind === "vote" && held.length > 0 && voteDetails}
    </li>
  )
}

type HeadProps = { row: VoteRow; head: RefObject<HTMLButtonElement | null>; onSearch: () => void; onClear: () => void }

function VoteHead({ row, head, onSearch, onClear }: HeadProps) {
  if (row.chosen !== null) return <VoteChosen name={row.name} chosen={row.chosen} ref={head} onChange={onSearch} onClear={onClear} />
  return (
    <VoteIdle row={row} ref={head} onSearch={onSearch}>
      <Chevron towards="right" />
    </VoteIdle>
  )
}
