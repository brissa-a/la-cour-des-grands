import type { ColorableFeature, FeatureKey } from "../data/features.ts"

type Props = { features: ColorableFeature[]; selected: FeatureKey; onSelect: (key: FeatureKey) => void }

export function ColorPicker({ features, selected, onSelect }: Props) {
  const byFile = Map.groupBy(features, f => f.file)
  return (
    <label className="control">
      Colorier par
      <select value={selected} onChange={e => onSelect(e.target.value as FeatureKey)}>
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
