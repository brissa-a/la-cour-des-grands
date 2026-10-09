import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react"
import { keyHelp, type KeyHelp } from "./config.ts"
import { keySpans, pathLabel, type KeySpan, type Segment } from "./jsonKeys.ts"
import { configStore } from "./useConfig.ts"

export function ConfigButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button className="icon-button" onClick={onToggle} aria-label="Configuration" aria-expanded={open} title="Configuration">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  )
}

type Status = "editing" | "saved" | "applied"

type Hint = { start: number; path: readonly Segment[]; help: Exclude<KeyHelp, { kind: "group" }>; top: number; left: number }

const HINT_WIDTH = 280

const STATUS_TEXT: Record<Status, string> = {
  editing: "Ctrl + Entrée pour enregistrer",
  saved: "Enregistré",
  applied: "Appliqué, non enregistré",
}

export function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(() => configStore.text())
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState<Status>("editing")
  const [hint, setHint] = useState<Hint | null>(null)
  const spans = useMemo(() => keySpans(text), [text])

  useEffect(() => {
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      onClose()
    }
    addEventListener("keydown", onEscape, true)
    return () => removeEventListener("keydown", onEscape, true)
  }, [onClose])

  const save = () => {
    const result = configStore.save(text)
    if (!result.ok) {
      setErrors(result.errors)
      setStatus("editing")
      return
    }
    setErrors([])
    setText(configStore.text())
    setHint(null)
    setStatus(result.persisted ? "saved" : "applied")
  }

  const reset = () => {
    const { persisted } = configStore.reset()
    setText(configStore.text())
    setHint(null)
    setErrors([])
    setStatus(persisted ? "saved" : "applied")
  }

  const onHover = (e: MouseEvent<HTMLTextAreaElement>) => {
    const next = hintAt(e.currentTarget, spans, e.clientX, e.clientY)
    setHint(current => (current?.start === next?.start ? current : next))
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    save()
  }

  return (
    <div className="config-panel panel" role="dialog" aria-label="Configuration" data-obstacle="" onKeyDown={onKeyDown}>
      <div className="config-head">
        <span>Configuration</span>
        <button className="icon-button" onClick={onClose} aria-label="Fermer la configuration">
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5 L15 15 M15 5 L5 15" />
          </svg>
        </button>
      </div>
      <div className="config-editor">
        <textarea
          value={text}
          onChange={e => {
            setText(e.target.value)
            setStatus("editing")
            setHint(null)
          }}
          onMouseMove={onHover}
          onMouseLeave={() => setHint(null)}
          onScroll={() => setHint(null)}
          spellCheck={false}
          autoFocus
          wrap="off"
          rows={12}
          aria-label="Configuration en JSON"
          aria-invalid={errors.length > 0}
        />
        {hint && (
          <div className="config-hint" role="tooltip" style={{ top: hint.top, left: hint.left, width: HINT_WIDTH }}>
            <code>{pathLabel(hint.path)}</code>
            {hint.help.kind === "option" ? (
              <>
                <p>{hint.help.description}</p>
                <p className="config-hint-meta">
                  Attendu : {hint.help.expected} · Par défaut : {JSON.stringify(hint.help.fallback)}
                </p>
              </>
            ) : (
              <p>Clé inconnue, refusée à l'enregistrement.</p>
            )}
          </div>
        )}
      </div>
      {errors.length > 0 && (
        <ul className="config-errors" role="alert">
          {errors.map(error => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div className="config-actions">
        <button className="text-button" onClick={reset}>
          Réinitialiser
        </button>
        <span className="config-status" aria-live="polite">
          {STATUS_TEXT[status]}
        </span>
        <button className="primary-button" onClick={save}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}

function hintAt(textarea: HTMLTextAreaElement, spans: readonly KeySpan[], clientX: number, clientY: number): Hint | null {
  const style = getComputedStyle(textarea)
  const lineHeight = parseFloat(style.lineHeight)
  const charWidth = monospaceWidth(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`)
  const rect = textarea.getBoundingClientRect()
  const originX = textarea.clientLeft + parseFloat(style.paddingLeft) - textarea.scrollLeft
  const originY = textarea.clientTop + parseFloat(style.paddingTop) - textarea.scrollTop
  const line = Math.floor((clientY - rect.top - originY) / lineHeight)
  const cell = Math.floor((clientX - rect.left - originX) / charWidth)
  const lines = textarea.value.split("\n")
  const lineText = lines[line]
  if (lineText === undefined || line < 0) return null
  const starts = cellStarts(lineText, parseFloat(style.tabSize) || 8)
  if (cell < 0 || cell >= (starts[lineText.length] ?? 0)) return null
  const column = starts.findLastIndex(start => start <= cell)
  const lineStart = lines.slice(0, line).reduce((offset, l) => offset + l.length + 1, 0)
  const onLine = spans.filter(span => span.start >= lineStart && span.start < lineStart + lineText.length)
  const span = onLine.findLast(s => s.start - lineStart <= column) ?? onLine[0]
  if (!span) return null
  const help = keyHelp(span.path)
  if (help.kind === "group") return null
  const keyLeft = originX + (starts[span.start - lineStart] ?? 0) * charWidth
  return {
    start: span.start,
    path: span.path,
    help,
    top: originY + (line + 1) * lineHeight + 2,
    left: Math.max(0, Math.min(keyLeft, textarea.clientWidth - HINT_WIDTH)),
  }
}

function cellStarts(line: string, tabSize: number): number[] {
  const starts = [0]
  for (let i = 0; i < line.length; i++) {
    const cell = starts[i] ?? 0
    starts.push(line[i] === "\t" ? (Math.floor(cell / tabSize) + 1) * tabSize : cell + 1)
  }
  return starts
}

const widths = new Map<string, number>()

function monospaceWidth(font: string): number {
  const known = widths.get(font)
  if (known !== undefined) return known
  const context = document.createElement("canvas").getContext("2d")
  if (!context) return 7.2
  context.font = font
  const width = context.measureText("0".repeat(100)).width / 100
  widths.set(font, width)
  return width
}
