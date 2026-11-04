import { CopyButton } from "../copy/CopyButton.tsx"

export function EmbedButton({ code }: { code: () => string }) {
  return (
    <CopyButton
      className="embed-copy"
      text={code}
      label="Intégrer"
      done="Copié"
      fieldLabel="Code d'intégration"
      title="Copier le code d'intégration"
      icon={
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
        </svg>
      }
    />
  )
}
