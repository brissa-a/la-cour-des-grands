import { useRef } from "react"
import type { Fit, Mark } from "../forms/form.ts"
import { RULE_CLASS, labelAttributes, nameAttributes } from "./markAttributes.ts"
import { transitionOf, type Motion } from "./staging.ts"

type RoomMark = Extract<Mark, { kind: "room" }>

type Props = { marks: readonly Mark[]; scale: number; motion: Motion }

export function Marks({ marks, scale, motion }: Props) {
  const room = marks.find((mark): mark is RoomMark => mark.kind === "room") ?? null
  const lastRoom = useRef(room)
  if (room) lastRoom.current = room
  const drawnRoom = room ?? lastRoom.current
  const axes = marks.filter(mark => mark.kind !== "room")
  return (
    <>
      {drawnRoom && (
        <g className={room ? "room" : "room hidden"} transform={`scale(${1 / scale})`}>
          <g className="room-fit" style={{ transform: fitTransform(drawnRoom.fit, scale), ...transitionOf(motion) }}>
            <g className="hemicycle-background" transform={`scale(${scale})`} dangerouslySetInnerHTML={{ __html: drawnRoom.room }} />
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

function fitTransform({ scale: fitScale, offset }: Fit, scale: number): string {
  return `translate(${offset.x * scale}px, ${offset.y * scale}px) scale(${fitScale})`
}

function MarkShape(mark: Mark, index: number) {
  switch (mark.kind) {
    case "room":
      return null
    case "rule":
      return (
        <line
          key={index}
          className={RULE_CLASS[mark.tone]}
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
  const name = nameAttributes(at, lay)
  return (
    <text x={at.x} y={at.y} {...labelAttributes(at, lay)} style={{ fontSize: size }}>
      <title>{title}</title>
      <tspan className="chart-count">{count}</tspan>
      {name ? <tspan {...name}>{text}</tspan> : ` ${text}`}
    </text>
  )
}
