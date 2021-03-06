import Typography from '@material-ui/core/Typography';
import React, { ReactChild, ReactChildren } from 'react';
import SvgCaption from '../Caption';
import { Siege } from '../Depute';
import { Border, Tribune } from '../SvgPath';
import { VisualLayout, VisualColor, VisualProps, Visual } from "../visual/VisualType";

const rand = Math.round(Math.random() * 300)

const params = new URLSearchParams(window.location.search)

function minMaxRange(list : number[]) :{ min:number, max:number, range:number, avg:number } ;
function minMaxRange(list : any[], getter: (a:any) => number) :{ min:number, max:number, range:number, avg:number } ;

function minMaxRange(list : number[] | any[], getter?: (a:any) => number) {
  let numList = getter ? list.map(getter) : list as number[]
  const min = Math.min(...numList)
  const max = Math.max(...numList)
  const range = max - min
  const avg = numList.reduce((a: number, b: number) => a + b, 0) / numList.length
  return { min, max, range, avg }
}

type Column = {
  name: string,
  idx: number,
  width: number,
  y: number,
  x: number
}

export const chart = (visualLayout: VisualLayout) => (visualColor : VisualColor) => (deputes: DeputeApi[]) => {
  const Caption : React.FC = props => <SvgCaption visualColor={visualColor} />//To wrap for positioning
  const { groupes, maxColSize } = visualLayout.group(deputes)
  const deputeWithVisualProp : [DeputeApi, VisualProps][]  = []
  const columns: Column[] = []
  const margin = 1
  for (const [colIdx, [groupeName, deputes]] of groupes.entries()) {
    const colSize = maxColSize //deputes.length > maxColSize ? maxColSize : Math.max(deputes.length, 1)
    deputes.sort((a, b) => visualColor.sort(a, b))

    columns.push({
      name: groupeName,
      idx: colIdx,
      width: colSize,
      y: -Math.floor(deputes.length / colSize),
      x: colIdx * (colSize + margin) - (colSize + margin) * groupes.length / 2
    })
    for (const [sIdx, depute] of deputes.entries()) {
      const visualProps : VisualProps & {sIdx: number, colIdx: number} = {
        x: colIdx * (colSize + margin) + (sIdx % colSize) - (colSize + margin) * groupes.length / 2,
        y: -Math.floor(sIdx / colSize),
        colIdx: colIdx,
        sIdx: sIdx,
        ...visualColor.deputeColor(depute)
      }
      deputeWithVisualProp.push([depute, visualProps])
    }
  }
  const Blueprint : React.FC = props => {
    const fontSize = 1
    const yAxis = minMaxRange(columns, c => c.y)
    //const xAxis = minMaxRange(columns, c => c.x)
    const lastCol = columns[columns.length - 1]
    const firstCol = columns[0]
    const siegeSize = 1
    const stroke = "hsla(31, 0%, 100%, 0.2)"
    const strokeWidth = "0.05"

    ///X Axis
    const xAxisElems = columns.map(col => <g key={col.x} transform={`translate(${col.x}, 0)`}>
      <line x1={-siegeSize / 2} y1={siegeSize} x2={-siegeSize / 2} y2={siegeSize - 0.5} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={col.width - siegeSize / 2} y1={siegeSize} x2={col.width - siegeSize / 2} y2={siegeSize - 0.5} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={-siegeSize / 2} y1={siegeSize} x2={col.width - siegeSize / 2} y2={siegeSize} stroke={stroke} strokeWidth={strokeWidth} />
      <g transform={`translate(${-siegeSize / 2}, ${siegeSize * 2})`}>
        <foreignObject transform="scale(0.05)" width={(col.width * siegeSize) / 0.05 * 1.1} height="15rem">
          <div className="undraggable" style={{ padding: "-3px", textAlign: "center" }}>
            <Typography>{visualLayout.formatGroupeName(col.name)}</Typography>
          </div>
        </foreignObject>
      </g>
    </g>)
    const xAxisNameElem = <text
      fill="rgba(255, 255, 255, 0.9)" style={{ "textAnchor": "start" }}
      x={lastCol.x + lastCol.width} y={siegeSize * 3} fontSize={fontSize}
    >
      {visualLayout.xAxisName()}
    </text>

    //Y Axis
    const yAxisElems = []
    for (let i = -firstCol.width; i > yAxis.min; i -= firstCol.width) {
      const yAxisElem = <g key={i}>
        <line x1={firstCol.x - siegeSize / 2 - 1} y1={i + siegeSize / 2} x2={lastCol.x + lastCol.width + 1} y2={i + siegeSize / 2} stroke={stroke} strokeWidth={strokeWidth} />
        <text style={{ "textAnchor": "end" }} fill="rgba(255, 255, 255, 0.9)" x={firstCol.x - siegeSize / 2 - 1} y={i + siegeSize / 2} fontSize={fontSize}>
          {-i * firstCol.width}
        </text>
      </g>
      yAxisElems.push(yAxisElem)
    }

    const yAxisNameElem = <text
      fill="rgba(255, 255, 255, 0.9)" style={{ "textAnchor": "end" }}
      x={firstCol.x - siegeSize / 2 - 1} y={yAxis.min - siegeSize / 2} fontSize={fontSize}
    >
      Nombre de députés
    </text>



    const chartTitle = visualLayout.title && <g transform={`translate(${(-800 * 0.05 / 2)}, ${siegeSize * 5})`}>
      <foreignObject transform="scale(0.05)" width="800" height="500">
        <div className="undraggable" style={{ padding: "5px", textAlign: "center" }}>
          <Typography variant="body1">
            {visualLayout.title()}
          </Typography>
        </div>
      </foreignObject>
    </g>
    return <g>
      <g>
        {xAxisElems}
      </g>
      {xAxisNameElem}
      <g>
        {yAxisElems}
      </g>
      {yAxisNameElem}
      {chartTitle}
    </g>
  }
  const layout : Visual = { Blueprint, Caption, deputeWithVisualProp }
  return layout;
}



export const hemicycle = (sieges: SiegeApi[]) => (visualColor: VisualColor) => (deputes: DeputeApi[]) => {
  const Blueprint : React.FC = props => {
    return <g>
      <g>
        {sieges.map(s => <Siege key={s.id} siege={s} />)}
      </g>
      <Border /><Tribune />
    </g>
  }
  const Caption : React.FC = props => <SvgCaption visualColor={visualColor} />//To wrap for positioning
  const deputeWithVisualProp = deputes.map((depute: DeputeApi) : [DeputeApi, VisualProps] => {
    const color = visualColor.deputeColor(depute)
    const visualProps : VisualProps = {
      x: depute.lcdg.siege.pos.x * 29,
      y: depute.lcdg.siege.pos.y * 29,
      ...color
    }
    return [depute, visualProps]
  });
  const layout : Visual = { Blueprint, Caption, deputeWithVisualProp }
  return layout;
}


interface Props {
  deputeWithVisualProp : [DeputeApi, VisualProps][],
  children: (x:{depute:DeputeApi, visualProps:VisualProps}) => ReactChild
}
interface State {}  

export class DeputesRenderer extends React.PureComponent<Props, State> {

  constructor(props: Props) {
    super(props)
  }

  render() {
    const onlyOne = params.has("onlyOne") ? params.get("onlyOne") === 'true' : false
    const { children } = this.props
    let { deputeWithVisualProp } = this.props
    deputeWithVisualProp = onlyOne ? [deputeWithVisualProp[rand]] : deputeWithVisualProp
    const deputeElems = deputeWithVisualProp
      .sort(([a, x], [b, y]) => a.uid.localeCompare(b.uid))//Keep fixed order to avoid react rerendering 
      .map(([depute, visualProps]) => this.props.children && this.props.children({ depute, visualProps }))
    return deputeElems
  }

}
