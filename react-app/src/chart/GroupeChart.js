import React, {PureComponent} from 'react';
import sieges from '../sieges.json'
import popfr from './popfrByAge.json'
import "./DefaultChart.css"
import groupes from '../groupes.json'
import {groupBy, copy} from '../functional.js'

function minMaxRange(list, getter) {
  if (getter) list = list.map(getter)
  const min = Math.min(...list)
  const max = Math.max(...list)
  const range = max - min
  const avg = list.reduce((a, b) => a + b, 0) / list.length
  return {min,max,range, avg}
}

function hslstr({h,s,v}) {
  return `hsl(${h}, ${s}%, ${v}%)`
}

class Chart extends PureComponent {

  constructor(props) {
    super()
    const groupByGroupe = groupBy(s => s.depute.groupe)
    const groupedByGroup = sieges
      .filter(s => s.depute)
      .reduce(groupByGroupe, {})
    const columns = Object.entries(groupedByGroup)
      .map(([key, value]) => ({
        groupeName: key, count: value.length, siegeids: value.map(s=>s.siegeid)
      }))
      .map(({groupeName, count, siegeids}) => ({
          x: groupeName, y: count, siegeids,
          color: copy(groupes[groupeName].color, old => ({s: old.s * 0.70})),
      }))
      .sort((a,b) => b.y - a.y)
    this.columns = columns
    this.state = {
      highlightColIdx: null
    }
  }

  highlight(col, idx) {
    this.setState({highlightColIdx: idx})
    this.props.app.setHighlightSiegeIds(col.siegeids)
  }

  render() {
    const {columns} = this
    const yAxis = minMaxRange(columns, c=>c.y)
    const xAxis = {
      min: 0, max: columns.length, range: columns.length
    }
    const aspectRatio = 3
    const fontSize = 0.05
    const space = 0.25//1/xAxis.range * 0.5
    const columnWidth = (1/(xAxis.max - xAxis.min)*(1-space)) * aspectRatio
    const columnSpace = (1/(xAxis.max - xAxis.min)) * aspectRatio
    const columnElems = []
    for (const [index, column] of columns.entries()) {
      const colIdx = index - xAxis.min
      const heightRate = column.y / yAxis.max
      const stroke = colIdx == this.state.highlightColIdx  ? "hsla(31, 50%, 100%, 1)" : ""
      const elem = <g transform={`translate(${0}, ${columnSpace * colIdx})`} onMouseEnter={() => this.highlight(column, colIdx)}>
        <rect
          x={0} y={0} height={columnWidth} width={heightRate}
          fill={hslstr(column.color)} strokeWidth="0.001" fillOpacity="1" stroke={stroke}
        />
      </g>
      columnElems.push(elem)
    }

    const xAxisElems = {}
    for (const [index, column] of columns.entries()) {
      const colIdx = index - xAxis.min
      const elem = <g transform={`translate(${0},${columnSpace * colIdx})`} onMouseEnter={() => this.highlight(column, colIdx)}>
        <text y={columnWidth/2 + fontSize/2} x={0.5} fill="rgba(255, 255, 255, 0.9)" fontSize={fontSize}>{column.x}</text>
        <text y={columnWidth/2 + fontSize/2 + fontSize} x={0.5} fill="rgba(255, 255, 255, 0.9)" fontSize={fontSize}>{Math.round(column.y / 577 * 1000)/10}%</text>
      </g>
      columnElems.push(elem)
    }
    const xAxisNameElem = <text text-anchor="middle" y={0.1 + aspectRatio} x={-fontSize} fontSize={fontSize} fill="rgba(255, 255, 255, 0.9)">
      Groupe
    </text>

    const sampleCount = 6
    const yAxisElems = [];
    for (let i = 0; i <= (sampleCount - 1); i++) {
      const heightRate = i/(sampleCount - 1)
      const value = Math.round((1-heightRate) * yAxis.max)
      const elem =<g transform={`translate(${(1-heightRate)}, ${0})`}>
        <text y={-0.04} x={fontSize/2.5} fontSize={fontSize} fill="rgba(255, 255, 255, 0.9)">{value}</text>
        <line y1={0} x1={0} y2={aspectRatio} x2={0} stroke="hsla(31, 25%, 50%, 0.8)" strokeWidth="0.001" />
      </g>
      yAxisElems.push(elem);
    }
    const yAxisNameElem = <text y={-0.04} x={1+0.35} fontSize={fontSize} fill="rgba(255, 255, 255, 0.9)">
      Nombre de députés
    </text>
    //Order = zindex
    let elems = [...yAxisElems, ...columnElems, xAxisNameElem,yAxisNameElem]
    return <g transform="scale(13)">{elems}</g>
  }
}

export default Chart
