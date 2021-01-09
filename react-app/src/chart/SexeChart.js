import React, {PureComponent} from 'react';
import * as d3 from "d3";
import sieges from '../sieges.json'
import "./DefaultChart.css"

function getAge(dateNais) {
    var today = new Date();
    const birthDate = new Date(dateNais)
    var age = today.getFullYear() - birthDate.getFullYear();
    var m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

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

const groupBySexe = groupBy(s => s.depute.femme ?  "femme" : "homme")

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

  constructor() {
    super()
    const groupedBySexe = sieges.filter(s => s.depute)
      .reduce(groupBySexe, {"homme": [], "femme": []})
    this.columns = [
      {
        x: "Femme",
        y: groupedBySexe["femme"].length,
        siegeids: groupedBySexe["femme"].map(s=>s.siegeid),
        color: {
          h:299, s:37*0.70, v:46
        }
      },
      {
        x: "Homme",
        y: groupedBySexe["homme"].length,
        siegeids: groupedBySexe["homme"].map(s=>s.siegeid),
        color: {
          h:203, s:37*0.70, v:46
        }
      },
    ].sort((a,b) => b.y - a.y)
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
        <text style={{textAnchor: "start"}}  y={columnWidth/2 + fontSize/2} x={+0.01} fill="rgba(255, 255, 255, 0.9)" fontSize={fontSize}>{column.x}</text>
      </g>
      columnElems.push(elem)
    }

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
    let elems = [...yAxisElems, ...columnElems,yAxisNameElem]
    return <g transform="scale(13)">{elems}</g>
  }
}

export default Chart
