import { useRef, useState, type ReactNode, type RefObject } from "react"
import type { LayoutChoice } from "../forms/registry.ts"
import { GlyphIcon } from "../glyph/GlyphIcon.tsx"
import type { View } from "../view/view.ts"
import type { VoteFinder } from "../votes/voteSearch.ts"
import type { Vote } from "../votes/votes.ts"
import { Chevron, GlyphButton, RowHead, SummaryLine } from "./PanelParts.tsx"
import { choiceKey, greyedReason, holds, offerLabel, pressed, replaces, rowSubject, unfoldedRow, type ChoiceKey, type ChosenVote, type Offer, type Row } from "./rows.ts"
import { sentenceText, summary } from "./summary.ts"
import { VotePicker } from "./VotePicker.tsx"
import { waitsFor, type Intent, type Press } from "./viewState.ts"

const CONTENT_ID = "side-panel-content"

type Props = {
  view: View
  rows: readonly Row[]
  chosen: ChosenVote | null
  pending: Intent | null
  folded: boolean
  composition: string | null
  hint: (choice: LayoutChoice) => string | null
  search: ReactNode
  voteDetails: ReactNode
  bottom: ReactNode
  finder: () => Promise<VoteFinder>
  onPress: (offer: Offer) => Press
  onPickVote: (vote: Vote) => void
  onClearVote: () => void
  onFold: () => void
}

export function FeaturePanel(props: Props) {
  const { view, rows, chosen, folded, composition, search, bottom, onFold } = props
  const voteInput = useRef<HTMLInputElement>(null)
  const [color, layout] = summary(view, chosen)

  return (
    <aside className={`side-panel${folded ? " folded" : ""}`} aria-label="Vue et caractéristiques" data-obstacle="">
      <div className="side-rail">
        <button type="button" className="icon-button side-fold" onClick={onFold} aria-label="Déplier le panneau" aria-expanded={false} aria-controls={CONTENT_ID}>
          <Chevron towards="right" />
        </button>
        <span title={sentenceText(color)}>
          <GlyphIcon glyph={color.glyph} size={20} className="rail-glyph" />
        </span>
        <span title={sentenceText(layout)}>
          <GlyphIcon glyph={layout.glyph} size={20} className="rail-glyph" />
        </span>
      </div>
      <div className="side-content" id={CONTENT_ID}>
        <div className="side-top">
          {search}
          <button type="button" className="icon-button side-fold" onClick={onFold} aria-label="Replier le panneau" aria-expanded={true} aria-controls={CONTENT_ID}>
            <Chevron towards="left" />
          </button>
        </div>
        <div className="side-summary" role="status" aria-label="Vue actuelle">
          <span className="side-caption">VUE</span>
          <SummaryLine sentence={color} />
          <SummaryLine sentence={layout} />
          {composition && <span className="summary-note">{composition}</span>}
        </div>
        <div className="side-body">
          <div className="cell-captions" aria-hidden="true">
            <span className="cell-color">couleur</span>
            <span className="cell-layout">disposition</span>
          </div>
          <ul className="feature-rows" aria-label="Caractéristiques">
            {rows.map(row => (
              <FeatureRow key={row.key} {...props} row={row} voteInput={voteInput} />
            ))}
          </ul>
        </div>
        <div className="side-bottom">{bottom}</div>
      </div>
    </aside>
  )
}

type RowProps = Props & { row: Row; voteInput: RefObject<HTMLInputElement | null> }

function FeatureRow({ row, view, chosen, pending, hint, voteDetails, finder, voteInput, onPress, onPickVote, onClearVote }: RowProps) {
  const [hovered, setHovered] = useState<ChoiceKey | null>(null)
  const hoveredOffer = [...row.color, ...row.layout].find(offer => choiceKey(offer.choice) === hovered)
  const greyed = greyedReason(row)
  const tip = hoveredOffer && (greyed ?? replaces(view, hoveredOffer, chosen))
  const held = holds(view, row)
  const unfolded = unfoldedRow(view) === row.key
  const unfoldedLayout = unfolded ? row.layout.find(offer => pressed(view, offer)) : undefined
  const hintText = unfoldedLayout && hint(unfoldedLayout.choice)
  const press = (offer: Offer) => {
    const result = onPress(offer)
    if (result.kind === "wait" && result.waiting) voteInput.current?.focus()
  }
  const glyph = (offer: Offer, labelled: boolean) => (
    <GlyphButton
      key={choiceKey(offer.choice)}
      offer={offer}
      label={offerLabel(row, offer)}
      pressed={pressed(view, offer)}
      greyed={greyed}
      waiting={waitsFor(pending, offer)}
      labelled={labelled}
      size={20}
      onPress={press}
      onHint={shown => setHovered(shown ? choiceKey(offer.choice) : null)}
    />
  )
  const classes = ["feature-row", held.length > 0 && "held", unfolded && "unfolded"].filter(Boolean).join(" ")
  return (
    <li className={classes}>
      {row.kind === "vote" ? (
        <VotePicker name={row.name} chosen={row.chosen} finder={finder} inputRef={voteInput} onPick={onPickVote} onClear={onClearVote} />
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
        <span className="row-replaces" role="tooltip">
          {tip}
        </span>
      )}
      {hintText && <p className="row-hint">{hintText}</p>}
      {row.kind === "vote" && held.length > 0 && voteDetails}
    </li>
  )
}
