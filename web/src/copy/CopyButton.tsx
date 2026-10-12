import { useEffect, useState, type ReactNode } from "react"
import { copyText } from "./clipboard.ts"

const COPIED_MS = 1500

type State = { readonly kind: "ready" } | { readonly kind: "copied" } | { readonly kind: "failed"; readonly text: string }

type Props = {
  text: () => string
  label: string
  done: string
  fieldLabel: string
  title?: string
  className: string
  icon: ReactNode
}

export function CopyButton({ text, label, done, fieldLabel, title, className, icon }: Props) {
  const [state, setState] = useState<State>({ kind: "ready" })

  useEffect(() => {
    if (state.kind !== "copied") return
    const timeout = setTimeout(() => setState({ kind: "ready" }), COPIED_MS)
    return () => clearTimeout(timeout)
  }, [state])

  const copy = () => {
    const copied = text()
    void copyText(copied, navigator.clipboard).then(result => setState(result === "copied" ? { kind: "copied" } : { kind: "failed", text: copied }))
  }

  if (state.kind === "failed")
    return (
      <input
        className="copy-field"
        readOnly
        value={state.text}
        aria-label={fieldLabel}
        autoFocus
        onFocus={e => {
          e.currentTarget.select()
          e.currentTarget.scrollLeft = 0
        }}
        onBlur={() => setState({ kind: "ready" })}
      />
    )

  return (
    <button type="button" className={className} title={title} onClick={copy}>
      {icon}
      {state.kind === "copied" ? done : label}
    </button>
  )
}
