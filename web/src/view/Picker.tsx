import type { Option } from "./options.ts"

type Props<C> = {
  label: string
  options: readonly Option<C>[]
  selected: string
  onSelect: (choice: C) => void
}

export function Picker<C>({ label, options, selected, onSelect }: Props<C>) {
  const loose = options.filter(option => option.group === null)
  const groups = new Map<string, Option<C>[]>()
  for (const option of options) {
    if (option.group === null) continue
    const inGroup = groups.get(option.group)
    if (inGroup) inGroup.push(option)
    else groups.set(option.group, [option])
  }
  const pick = (id: string) => {
    const option = options.find(o => o.id === id)
    if (option) onSelect(option.choice)
  }
  return (
    <label className="control">
      {label}
      <select value={selected} onChange={e => pick(e.target.value)}>
        {loose.map(OptionTag)}
        {groups.size === 1
          ? [...groups.values()].flat().map(OptionTag)
          : [...groups].map(([group, inGroup]) => (
              <optgroup key={group} label={group}>
                {inGroup.map(OptionTag)}
              </optgroup>
            ))}
      </select>
    </label>
  )
}

function OptionTag<C>(option: Option<C>) {
  return (
    <option key={option.id} value={option.id}>
      {option.label}
    </option>
  )
}
