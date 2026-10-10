import type { ColorableFeature } from "../data/features.ts"
import { VOTE, type ColoringKey } from "./coloring.ts"

type Props = {
  label: string
  features: ColorableFeature[]
  vote: string | null
  selected: ColoringKey | null
  onSelect: (key: ColoringKey | null) => void
  noneLabel?: string
}

const NONE = ""

export function FeaturePicker({ label, features, vote, selected, onSelect, noneLabel }: Props) {
  const byFile = Map.groupBy(features, f => f.file)
  const pick = (value: string) => {
    if (value === VOTE && vote !== null) onSelect(VOTE)
    else onSelect(features.find(f => f.key === value)?.key ?? null)
  }
  return (
    <label className="control">
      {label}
      <select value={selected ?? NONE} onChange={e => pick(e.target.value)}>
        {noneLabel !== undefined && <option value={NONE}>{noneLabel}</option>}
        {byFile.size === 1 && vote === null
          ? features.map(Option)
          : [...byFile].map(([file, inFile]) => (
              <optgroup key={file} label={file}>
                {inFile.map(Option)}
              </optgroup>
            ))}
        {vote !== null && (
          <optgroup label="Scrutin">
            <option value={VOTE}>{vote}</option>
          </optgroup>
        )}
      </select>
    </label>
  )
}

function Option(f: ColorableFeature) {
  return (
    <option key={f.key} value={f.key}>
      {f.title}
    </option>
  )
}
