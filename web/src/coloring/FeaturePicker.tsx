import type { ColorableFeature, FeatureKey } from "../data/features.ts"

type Props = {
  label: string
  features: ColorableFeature[]
  selected: FeatureKey | null
  onSelect: (key: FeatureKey | null) => void
  noneLabel?: string
}

const NONE = ""

export function FeaturePicker({ label, features, selected, onSelect, noneLabel }: Props) {
  const byFile = Map.groupBy(features, f => f.file)
  return (
    <label className="control">
      {label}
      <select value={selected ?? NONE} onChange={e => onSelect(e.target.value === NONE ? null : (e.target.value as FeatureKey))}>
        {noneLabel !== undefined && <option value={NONE}>{noneLabel}</option>}
        {byFile.size === 1
          ? features.map(Option)
          : [...byFile].map(([file, inFile]) => (
              <optgroup key={file} label={file}>
                {inFile.map(Option)}
              </optgroup>
            ))}
      </select>
    </label>
  )
}

function Option(f: ColorableFeature) {
  return (
    <option key={f.key} value={f.key}>
      {f.feature.title}
    </option>
  )
}
