import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react"
import { GlyphIcon } from "../glyph/GlyphIcon.tsx"
import { VOTE, type Reading, type Source } from "../sources/shapes.ts"
import type { View } from "../view/view.ts"
import type { VoteFinder } from "../votes/voteSearch.ts"
import type { Vote } from "../votes/votes.ts"
import { Chevron, GlyphButton, RowHead, SearchIcon, SummaryLine } from "./PanelParts.tsx"
import {
  choiceKey,
  greyedReason,
  holds,
  offerLabel,
  pressed,
  rowHint,
  rowKey,
  rowSubject,
  rowTip,
  unfoldedRow,
  type ChoiceKey,
  type ChosenVote,
  type Offer,
  type Row,
  type RowKey,
} from "./rows.ts"
import { sentenceText, summary, type Sentence } from "./summary.ts"
import { VotePicker } from "./VotePicker.tsx"
import { waitsFor, type Intent, type Press } from "./viewState.ts"

const CONTENT_ID = "side-panel-content"
// Long enough for the vote just picked to load and grow its row's details.
const FOLLOW_MS = 3000

type Props = {
  view: View
  rows: readonly Row[]
  chosen: ChosenVote | null
  pending: Intent | null
  folded: boolean
  composition: string | null
  read: (source: Source) => Reading | null
  search: ReactNode
  searchInput: RefObject<HTMLInputElement | null>
  voteDetails: ReactNode
  bottom: ReactNode
  finder: () => Promise<VoteFinder>
  voteCount: number | null
  onPress: (offer: Offer) => Press
  onPickVote: (vote: Vote) => void
  onClearVote: () => void
  onFold: () => void
}

type FocusAfterFold = "rail" | "content" | "search"

type Follow = { readonly key: RowKey }

export function FeaturePanel(props: Props) {
  const { view, chosen, folded, search, searchInput, onFold } = props
  const [color, layout] = summary(view, chosen)
  const railFold = useRef<HTMLButtonElement>(null)
  const contentFold = useRef<HTMLButtonElement>(null)
  const focusAfterFold = useRef<FocusAfterFold | null>(null)

  useEffect(() => {
    const target = focusAfterFold.current
    focusAfterFold.current = null
    if (target === "rail") railFold.current?.focus()
    else if (target === "content") contentFold.current?.focus()
    else if (target === "search") searchInput.current?.focus()
  }, [folded, searchInput])

  const fold = (then: FocusAfterFold) => {
    focusAfterFold.current = then
    onFold()
  }

  return (
    <aside className={`side-panel${folded ? " folded" : ""}`} aria-label="Vue et caractéristiques" data-obstacle="">
      <div className="side-rail">
        <button
          ref={railFold}
          type="button"
          className="icon-button side-fold"
          onClick={() => fold("content")}
          aria-label="Déplier le panneau"
          aria-expanded={false}
          aria-controls={CONTENT_ID}
        >
          <Chevron towards="right" />
        </button>
        <button type="button" className="icon-button rail-search" onClick={() => fold("search")} aria-label="Rechercher un député, une adresse ou un scrutin" title="Rechercher">
          <SearchIcon />
        </button>
        <RailGlyph sentence={color} />
        <RailGlyph sentence={layout} />
      </div>
      <div className="side-content" id={CONTENT_ID}>
        <div className="side-top">
          {!folded && search}
          <button
            ref={contentFold}
            type="button"
            className="icon-button side-fold"
            onClick={() => fold("rail")}
            aria-label="Replier le panneau"
            aria-expanded={true}
            aria-controls={CONTENT_ID}
          >
            <Chevron towards="left" />
          </button>
        </div>
        <PanelBody {...props} color={color} layout={layout} />
      </div>
    </aside>
  )
}

function RailGlyph({ sentence }: { sentence: Sentence }) {
  const text = sentenceText(sentence)
  return (
    <span role="img" aria-label={text} title={text}>
      <GlyphIcon glyph={sentence.glyph} size={20} className="rail-glyph" />
    </span>
  )
}

function PanelBody(props: Props & { color: Sentence; layout: Sentence }) {
  const { rows, composition, bottom, color, layout, onPickVote } = props
  const [voteEditing, setVoteEditing] = useState(false)
  const [followed, setFollowed] = useState<Follow | null>(null)
  const rowElements = useRef(new Map<RowKey, HTMLLIElement>())

  useEffect(() => {
    const row = followed && rowElements.current.get(followed.key)
    if (!row) return
    const observer = new ResizeObserver(() => row.scrollIntoView({ block: "nearest" }))
    observer.observe(row)
    const stop = setTimeout(() => setFollowed(null), FOLLOW_MS)
    return () => {
      observer.disconnect()
      clearTimeout(stop)
    }
  }, [followed])

  const follow = (key: RowKey) => setFollowed({ key })
  const stopFollowing = () => setFollowed(null)
  const pickVote = (vote: Vote) => {
    onPickVote(vote)
    follow(rowKey(VOTE))
  }

  return (
    <>
      <div className="side-summary" role="status" aria-label="Vue actuelle">
        <span className="side-caption">VUE</span>
        <SummaryLine sentence={color} />
        <SummaryLine sentence={layout} />
        {composition && <span className="summary-note">{composition}</span>}
      </div>
      <div className="side-body" onWheel={stopFollowing} onTouchMove={stopFollowing}>
        <div className="cell-captions" aria-hidden="true">
          <span className="cell-color">couleur</span>
          <span className="cell-layout">disposition</span>
        </div>
        <ul className="feature-rows" aria-label="Caractéristiques">
          {rows.map(row => (
            <FeatureRow
              key={row.key}
              {...props}
              row={row}
              element={element => {
                if (element) rowElements.current.set(row.key, element)
                else rowElements.current.delete(row.key)
              }}
              voteEditing={voteEditing}
              onVoteEditing={setVoteEditing}
              onPickVote={pickVote}
              onFollow={follow}
            />
          ))}
        </ul>
      </div>
      <div className="side-bottom">{bottom}</div>
    </>
  )
}

type RowProps = Props & {
  row: Row
  element: (element: HTMLLIElement | null) => void
  voteEditing: boolean
  onVoteEditing: (editing: boolean) => void
  onFollow: (key: RowKey) => void
}

function FeatureRow(props: RowProps) {
  const { row, element, view, chosen, pending, read, voteDetails, finder, voteCount, voteEditing, onVoteEditing, onPress, onPickVote, onClearVote, onFollow } = props
  const tipId = useId()
  const [hovered, setHovered] = useState<ChoiceKey | null>(null)
  const hoveredOffer = [...row.color, ...row.layout].find(offer => choiceKey(offer.choice) === hovered)
  const greyed = greyedReason(row)
  const tip = hoveredOffer && rowTip(view, row, hoveredOffer, chosen)
  const held = holds(view, row)
  const unfolded = unfoldedRow(view) === row.key
  const hintText = rowHint(view, row, read)
  const press = (offer: Offer) => {
    const result = onPress(offer)
    if (result.kind === "wait" && result.waiting) onVoteEditing(true)
    onFollow(row.key)
  }
  const glyph = (offer: Offer, labelled: boolean) => {
    const key = choiceKey(offer.choice)
    return (
      <GlyphButton
        key={key}
        offer={offer}
        label={offerLabel(row, offer)}
        pressed={pressed(view, offer)}
        greyed={greyed}
        waiting={waitsFor(pending, offer)}
        labelled={labelled}
        size={20}
        describedBy={tip && hovered === key ? tipId : undefined}
        onPress={press}
        onHint={shown => setHovered(shown ? key : null)}
      />
    )
  }
  const classes = ["feature-row", held.length > 0 && "held", unfolded && "unfolded"].filter(Boolean).join(" ")
  return (
    <li ref={element} className={classes}>
      {row.kind === "vote" ? (
        <VotePicker row={row} count={voteCount} editing={voteEditing} finder={finder} onEditing={onVoteEditing} onPick={onPickVote} onClear={onClearVote} />
      ) : (
        <RowHead row={row} />
      )}
      <span className="row-cells">
        <span className="cell cell-color" role="group" aria-label={`${rowSubject(row)} · couleur`}>
          {row.color.map(offer => glyph(offer, false))}
        </span>
        <span className={`cell cell-layout${unfolded ? " labelled" : ""}`} role="group" aria-label={`${rowSubject(row)} · disposition`}>
          {row.layout.map(offer => glyph(offer, unfolded))}
        </span>
      </span>
      {tip && (
        <span id={tipId} className="row-replaces" role="tooltip">
          {tip}
        </span>
      )}
      {hintText && <p className="row-hint">{hintText}</p>}
      {row.kind === "vote" && held.length > 0 && voteDetails}
    </li>
  )
}
