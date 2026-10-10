import { useRef } from "react"
import type { Mark } from "../forms/form.ts"

type RoomMark = Extract<Mark, { kind: "room" }>

type Props = { marks: readonly Mark[]; scale: number }

export function Marks({ marks, scale }: Props) {
  const room = marks.find((mark): mark is RoomMark => mark.kind === "room") ?? null
  const lastRoom = useRef(room)
  if (room) lastRoom.current = room
  const drawnRoom = room ?? lastRoom.current
  const axes = marks.filter(mark => mark.kind !== "room")
  return (
    <>
      {drawnRoom && (
        <g className={room ? "room" : "room hidden"}>
          <g className="hemicycle-background" dangerouslySetInnerHTML={{ __html: drawnRoom.room }} />
          <g transform={`scale(${1 / scale})`}>
            {drawnRoom.empty.map(seat => (
              <circle key={seat.number} className="empty-seat" cx={seat.x * scale} cy={seat.y * scale} r={drawnRoom.radius * scale} />
            ))}
          </g>
        </g>
      )}
      {axes.length > 0 && <g className="chart-axes">{axes.map(MarkShape)}</g>}
    </>
  )
}

function MarkShape(mark: Mark, index: number) {
  switch (mark.kind) {
    case "room":
      return null
    case "rule":
      return (
        <line
          key={index}
          className={mark.tone === "base" ? "chart-baseline" : undefined}
          x1={mark.from.x}
          x2={mark.to.x}
          y1={mark.from.y}
          y2={mark.to.y}
        />
      )
    case "tick":
      return (
        <text key={index} x={mark.at.x} y={mark.at.y} textAnchor="end" dominantBaseline="middle" style={{ fontSize: mark.size }}>
          {mark.text}
        </text>
      )
    case "label":
      return <Label key={index} mark={mark} />
  }
}

function Label({ mark }: { mark: Extract<Mark, { kind: "label" }> }) {
  const { at, count, text, title, size, lay } = mark
  const tooltip = <title>{title}</title>
  switch (lay.kind) {
    case "flat":
      return (
        <text x={at.x} y={at.y} textAnchor="middle" style={{ fontSize: size }}>
          {tooltip}
          <tspan className="chart-count">{count}</tspan>
          <tspan x={at.x} dy={lay.lineHeight}>
            {text}
          </tspan>
        </text>
      )
    case "slanted":
      return (
        <text x={at.x} y={at.y} textAnchor="end" transform={`rotate(${-lay.degrees} ${at.x} ${at.y})`} style={{ fontSize: size }}>
          {tooltip}
          <tspan className="chart-count">{count}</tspan>
          {` ${text}`}
        </text>
      )
  }
}
