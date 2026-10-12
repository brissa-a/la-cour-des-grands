import type { Band } from "../share/texts.ts"

const SITE_HOST = "cour-des-grands.fr"

export function CaptureBand({ band }: { band: Band }) {
  return (
    <footer className="capture-band">
      <p className="capture-title">{band.title}</p>
      <p className="capture-facts">
        {band.date !== null && <span className="capture-date">{band.date}</span>}
        {band.outcome && <span className={`vote-outcome ${band.outcome.result}`}>{band.outcome.label}</span>}
        {band.deputy !== null && (
          <span className="capture-deputy">
            <svg className="capture-ring" viewBox="-6 -6 12 12" aria-hidden="true">
              <circle r={4.6} />
            </svg>
            <span className="capture-name">{band.deputy}</span>
          </span>
        )}
        <span className="capture-site">{SITE_HOST}</span>
      </p>
    </footer>
  )
}
