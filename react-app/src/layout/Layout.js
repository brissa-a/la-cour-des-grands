import React, {PureComponent} from 'react';
import {Border, Tribune} from '../SvgPath.js'
import {Transition, TransitionGroup} from 'react-transition-group';
import {EmptySiege} from '../Siege.js'
import SvgCaption from '../Caption.js'
import Typography from '@material-ui/core/Typography';

const rand = Math.round(Math.random() * 300)

const params = new URLSearchParams(window.location.search)

function minMaxRange(list, getter) {
  if (getter) list = list.map(getter)
  const min = Math.min(...list)
  const max = Math.max(...list)
  const range = max - min
  const avg = list.reduce((a, b) => a + b, 0) / list.length
  return {min,max,range, avg}
}

export const chart = (visualLayout) => (visualColor) => (sieges) => {
  const Caption = props =>  <SvgCaption visualColor={visualColor}/>//To wrap for positioning
  const {groupes, maxColSize} = visualLayout.group(sieges.filter(s => s.depute))
  const siegeWithVisualProp = []
  const columns = []
  const margin = 1
  const curX = 0
  for (const [colIdx, [groupeName, sieges]] of groupes.entries()) {
    const colSize = maxColSize //sieges.length > maxColSize ? maxColSize : Math.max(sieges.length, 1)
    sieges.sort(visualColor.sort)

    columns.push({
      name: groupeName,
      idx: colIdx,
      width: colSize,
      y: -Math.floor(sieges.length / colSize),
      x: colIdx * (colSize + margin) - (colSize + margin) * groupes.length / 2
    })
    for (const [sIdx, siege] of sieges.entries()) {
      const visualProps = {
        x: colIdx * (colSize + margin) + (sIdx % colSize) - (colSize + margin) * groupes.length / 2,
        y: -Math.floor(sIdx / colSize),
        colIdx: colIdx,
        sIdx: sIdx,
        ...visualColor.siegeColor(siege)
      }
      siegeWithVisualProp.push([siege, visualProps])
    }
  }
  const Blueprint = props => {
    const fontSize = 1
    const yAxis = minMaxRange(columns, c => c.y)
    const xAxis = minMaxRange(columns, c => c.x)
    const lastCol = columns[columns.length - 1]
    const firstCol = columns[0]
    const siegeSize = 1
    const stroke = "hsla(31, 0%, 100%, 0.2)"
    const strokeWidth = "0.05"
    const xAxisElems = columns.map (col => <g transform={`translate(${col.x}, 0)`}>
      <line x1={-siegeSize/2} y1={siegeSize} x2={-siegeSize/2} y2={siegeSize - 0.5} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={col.width-siegeSize/2} y1={siegeSize} x2={col.width-siegeSize/2} y2={siegeSize - 0.5} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={-siegeSize/2} y1={siegeSize} x2={col.width-siegeSize/2} y2={siegeSize} stroke={stroke} strokeWidth={strokeWidth} />
      <g transform={`translate(${-siegeSize/2}, ${siegeSize * 2})`}>
        <foreignObject transform="scale(0.05)" width={(col.width * siegeSize)/0.05} height="5rem">
          <Typography><div style={{textAlign: "center"}}>{visualLayout.formatGroupeName(col.name)}</div></Typography>
        </foreignObject>
      </g>
    </g>)
    const xAxisNameElem = <text
      fill="rgba(255, 255, 255, 0.9)" style={{"text-anchor": "start"}}
      x={lastCol.x+lastCol.width} y={siegeSize*3} fontSize={fontSize}
    >
      {visualLayout.xAxisName()}
    </text>

    const yAxisElems = []
    for (let i = -firstCol.width; i > yAxis.min; i-=firstCol.width)  {
      const yAxisElem = <g>
        <line x1={firstCol.x-siegeSize/2-1} y1={i+siegeSize/2} x2={lastCol.x+lastCol.width+1} y2={i+siegeSize/2} stroke={stroke} strokeWidth={strokeWidth} />
        <text style={{"text-anchor": "end"}} fill="rgba(255, 255, 255, 0.9)" x={firstCol.x-siegeSize/2-1} y={i+siegeSize/2} fontSize={fontSize}>
          {-i * firstCol.width}
        </text>
      </g>
      yAxisElems.push(yAxisElem)
    }

    const yAxisNameElem = <text
      fill="rgba(255, 255, 255, 0.9)" style={{"text-anchor": "end"}}
      x={firstCol.x-siegeSize/2-1} y={yAxis.min-siegeSize/2} fontSize={fontSize}
    >
      Nombre de députés
    </text>

    return <g>
      {xAxisElems}
      {xAxisNameElem}
      {yAxisElems}
      {yAxisNameElem}
    </g>
  }
  return {Blueprint, Caption, siegeWithVisualProp, columns}
}



export const hemicycle = (visualLayout) => (visualColor) => (sieges) => {
  const Blueprint = props => {
    return <g>
    {sieges.filter(s => !s.depute).map(s => <EmptySiege key={s.siegeid} siege={s}/>)}
    <Border/><Tribune/>
    </g>
  }
  const Caption = props => <SvgCaption visualColor={visualColor}/>//To wrap for positioning
  const siegeWithVisualProp = sieges.filter(s => s.depute).map(siege => {
    const color = siege.depute && visualColor.siegeColor(siege) || {h:0,s:0,v:0}
    const visualProps = {
      x: siege.pos.x,
      y: siege.pos.y,
      ...color
    }
    return [siege, visualProps]
  });
  return {Blueprint, Caption, siegeWithVisualProp}
}

export class SiegesRenderer extends React.PureComponent {

  constructor(props) {
    super()
  }

  render() {
    const onlyOne = params.has("onlyOne") ? params.get("onlyOne") == 'true' : false
    const {highlightSiegeIds, showPic, app, children}  = this.props
    let {siegeWithVisualProp} = this.props
    siegeWithVisualProp  = onlyOne ? [siegeWithVisualProp[rand]] : siegeWithVisualProp
    const siegeElems = siegeWithVisualProp
    .sort(([a, x],[b, y]) => a.siegeid.localeCompare(b.siegeid))
    .map(([siege, visualProps]) => <g>
    {children({siege, visualProps})}
    </g>)
    return siegeElems
  }

}
