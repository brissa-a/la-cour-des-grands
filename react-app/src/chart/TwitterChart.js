import React, {PureComponent} from 'react';
import * as d3 from "d3";
import sieges from '../sieges.json'
import popfr from './popfrByAge.json'
import "./DefaultChart.css"
const {log, ceil, floor, round} = Math

function groupBy(get) {
  return (acc,x) => {
    acc = acc || {}
    const by = get(x)
    const list = acc[by] || []
    acc[by] = [x, ...list]
    return acc
  }
}

Object.prototype.let = function(f) {return f(this)}
Object.prototype.also = function(f) {f(this); return this}

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

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 })

function rangeName({from, to}) {
  const n = numberFormat.format
  if (from == 0 && to == 0) {
    return `Pas de compte twitter`
  }
  if (from - to  == 0) {
    return `${n(from)}`
  }
  return `de  ${n(from)}  à  ${n(to)}`
}



class Chart extends PureComponent {

  constructor(props) {
    super()
    const {powMax, sfMax, roundedMax, base} = props.visual.global
    const followerGroupsName = [`{"from":${0}, "to":${0}}`, `{"from":${1}, "to":${sfMax}}`]
    const sampleCount = powMax
    for (let i = 0; i < sampleCount; i++) {
      const from = sfMax * base**i
      const to = sfMax * base**(i + 1)
      followerGroupsName.push(`{"from":${from}, "to":${to}}`)
    }
    const groupByFollower = groupBy(s => {
      const follower =  s.depute?.twitter?.public_metrics?.followers_count || 0
      let groupIndex;
      if (follower != 0) {
         groupIndex = ceil(log(follower/sfMax)/log(base) + 1)
      } else {
         groupIndex = 0
      }
      return followerGroupsName[groupIndex]
    })
    const followerGroups = followerGroupsName.reduce(
      (acc, name) => acc.also(x => x[name] = []),
      {}
    )
    const columns = sieges
      .filter(s => s.depute)
      .reduce(groupByFollower, followerGroups)
      .let(Object.entries)
      .map(([key, value]) => ({
        follower_range: JSON.parse(key), count: value.length, siegeids: value.map(s=>s.siegeid)
      }))
      .map(({follower_range, count, siegeids}) => ({
          x: rangeName(follower_range), y: count, siegeids,
          color: props.visual.color(0.5),
          startcolor: props.visual.color(props.visual.t(follower_range.from)),
          endcolor: props.visual.color(props.visual.t(follower_range.to))
      }))
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
        <linearGradient id={"GradientTwitter" + colIdx} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color={hslstr(column.startcolor)}/>
          <stop offset="100%" stop-color={hslstr(column.endcolor)}/>
        </linearGradient>
        <rect
          x={0} y={0} height={columnWidth} width={heightRate}
          fill={`url(${"#GradientTwitter" + colIdx})`} strokeWidth="0.001" fillOpacity="1" stroke={stroke}
        />
      </g>
      columnElems.push(elem)
    }

    const xAxisElems = {}
    for (const [index, column] of columns.entries()) {
      const colIdx = index - xAxis.min
      const elem = <g transform={`translate(${0},${columnSpace * colIdx})`} onMouseEnter={() => this.highlight(column, colIdx)}>
        <text style={{textAnchor: "start"}}  y={columnWidth/2 + fontSize/2} x={+0.01} fill="rgba(255, 255, 255, 0.9)" fontSize={fontSize}>{column.x}</text>
      </g>
      columnElems.push(elem)
    }
    const xAxisNameElem = <text text-anchor="middle" y={0.1 + aspectRatio} x={-fontSize} fontSize={fontSize} fill="rgba(255, 255, 255, 0.9)">
      Nombre de follower
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
