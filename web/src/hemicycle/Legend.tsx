import type { Group } from "../data/assembly.ts"

type Props = { groups: Group[]; onHover: (group: Group | null) => void }

export function Legend({ groups, onHover }: Props) {
  return (
    <ul className="legend panel" onPointerLeave={() => onHover(null)}>
      {groups.map(group => (
        <li key={group.name} title={group.name} onPointerEnter={() => onHover(group)}>
          <span className="legend-dot" style={{ background: group.color }} />
          <span className="legend-name">{group.short}</span>
          <span className="legend-count">{group.seatCount}</span>
        </li>
      ))}
    </ul>
  )
}
