import React, {PureComponent} from 'react';
import sieges from '../sieges.json'
import popfr from './popfrByAge.json'
import "./DefaultChart.css"
import {groupBy} from '../functional.js'

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

const groupByAge = groupBy(s => getAge(s.depute.dateNais))

function minMaxRange(list, getter) {
  if (getter) list = list.map(getter)
  const min = Math.min(...list)
  const max = Math.max(...list)
  const range = max - min
  const avg = list.reduce((a, b) => a + b, 0) / list.length
  return {min,max,range, avg}
}

class Chart extends PureComponent {

  constructor() {
    super()
    const ages = sieges.filter(s => s.depute).map(s => getAge(s.depute.dateNais))
    const mmrAges = minMaxRange(ages)
    const agesGroup = {}
    for (let i = mmrAges.min; i <= mmrAges.max; i++) {
      agesGroup[i] = []
    }
    const groupedByAge = sieges.filter(s => s.depute)
      .reduce(groupByAge, agesGroup)
    const columns = Object.entries(groupedByAge)
      .map(([key, value]) => ({age: Number.parseInt(key), count: value.length, siegeids: value.map(s=>s.siegeid)}))
      .map(({age, count, siegeids}) => ({x: age, y: count, siegeids}))
    this.columns = columns
    this.mmrAges = mmrAges
    this.avgPopFr = popfr.slice(18).map(x => x.age * x.nombre).reduce((a,b) => a + b) / popfr.slice(18).map(x => x.nombre).reduce((a,b) => a + b)
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
    const xAxis = minMaxRange(columns, c=>c.x)
    const aspectRatio = 3
    const fontSize = 0.05
    const space = 0.25//1/xAxis.range * 0.5
    const columnWidth = (1/(xAxis.max - xAxis.min)*(1-space)) * aspectRatio
    const columnSpace = (1/(xAxis.max - xAxis.min)) * aspectRatio
    const columnElems = []
    for (const column of columns) {
      const colIdx = column.x - xAxis.min
      const heightRate = column.y / yAxis.max
      const stroke = colIdx == this.state.highlightColIdx  ? "hsla(31, 50%, 100%, 1)" : ""
      const {h,s,v} = this.props.color((column.x - xAxis.min)/xAxis.range)
      const hslstr = `hsl(${h}, ${s*0.70}%, ${v}%)`
      const elem = <g transform={`translate(${0}, ${columnSpace * colIdx})`} onMouseEnter={() => this.highlight(column, colIdx)}>
        <rect
          x={0} y={0} height={columnWidth} width={heightRate}
          fill={hslstr} strokeWidth="0.001" fillOpacity="1" stroke={stroke}
        />
      </g>
      columnElems.push(elem)
    }

    const xAxisElems = {}
    for (const column of columns) {
      const colIdx = column.x - xAxis.min
      const elem = <g transform={`translate(${0},${columnSpace * colIdx})`} onMouseEnter={() => this.highlight(column, colIdx)}>
        <text style={{textAnchor: "end"}}  y={columnWidth/2 + fontSize/2} x={-0.01} fill="rgba(255, 255, 255, 0.9)" fontSize={fontSize}>{column.x}</text>
      </g>
      columnElems.push(elem)
    }
    const xAxisNameElem = <text text-anchor="middle" y={0.1 + aspectRatio} x={-fontSize} fontSize={fontSize} fill="rgba(255, 255, 255, 0.9)">
      age
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

    let avgElem;
    {
      const {mmrAges} = this
      const widthRate = (mmrAges.avg - mmrAges.min) / mmrAges.range
      avgElem = <g transform={`translate(${(0)}, ${widthRate * aspectRatio + columnSpace/2})`}>
        <text style={{textAnchor: "start"}} y={0} x={1.07} fontSize={fontSize} fill="rgba(255, 255, 255, 0.9)">moy. d'age : {Math.round(mmrAges.avg*100)/100}</text>
        <line y1={0} x1={0} y2={0} x2={1.07} stroke="hsla(31, 25%, 75%, 1)" strokeWidth="0.003" />
      </g>
    }

    let avgPopElem;
    {
      const avgPopAge = 50.51410189
      const {mmrAges} = this
      const widthRate = (avgPopAge - mmrAges.min) / mmrAges.range
      avgPopElem = <g transform={`translate(${(0)}, ${widthRate * aspectRatio + columnSpace/2})`}>
        <text style={{textAnchor: "start"}}  y={0} x={1.07} fontSize={fontSize} fill="rgba(255, 255, 255, 0.9)">moy. d'age pop fr > 18ans : {Math.round(avgPopAge*100)/100}</text>
        <line y1={0} x1={0} y2={0} x2={1.07} stroke="hsla(31, 25%, 75%, 1)" strokeWidth="0.003" />
      </g>
    }
    //Order = zindex
    let elems = [...yAxisElems, ...columnElems, avgElem, avgPopElem,xAxisNameElem,yAxisNameElem]
    return <g transform="scale(13)">{elems}</g>
  }
}

export default Chart
