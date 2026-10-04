import type { Deputy } from "../data/assembly.ts"

type Props = { deputy: Deputy; pinned: boolean; officialPage: string | undefined; onUnpin: () => void }

export function DeputyCard({ deputy, pinned, officialPage, onUnpin }: Props) {
  const color = deputy.politicalGroup.color
  return (
    <aside className="deputy-card panel">
      <div className="portrait">
        <img className="portrait-photo" src={deputy.photo} alt="" style={{ borderColor: color }} />
        {pinned && (
          <button className="unpin" onClick={onUnpin} title="Détacher la fiche" aria-label="Détacher la fiche">
            📌
          </button>
        )}
      </div>
      <h2>
        <span className="civility">{deputy.civility}</span> {deputy.first_name} {deputy.last_name}
      </h2>
      <p className="small-details">
        <span title="Date de naissance">🎂 {formatDate(deputy.birth_date)} ({deputy.age} ans)</span>
        <span title="Siège">💺 {deputy.seat.number}</span>
      </p>
      <dl>
        <dt>Circonscription</dt>
        <dd>
          {deputy.department} ({deputy.department_number}) circo n<sup>o</sup>
          {deputy.constituency_number}
        </dd>
        <dt>Groupe</dt>
        <dd>
          <span className="legend-dot" style={{ background: color }} /> {deputy.group}
        </dd>
      </dl>
      {officialPage && (
        <a className="official-link" href={officialPage} target="_blank" rel="noreferrer">
          <img src="/logo-gris.png" alt="" width={32} /> Fiche sur le site de l'Assemblée
        </a>
      )}
    </aside>
  )
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-")
  return `${day}/${month}/${year}`
}
