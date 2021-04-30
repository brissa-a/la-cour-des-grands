import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link, Typography } from '@material-ui/core';
import { Fragment } from 'react';
import { groupBy } from '../functional';
import { Color } from './VisualType';

const colors: Record<string, Color> = {
  "P": { h: 101, s: 47, v: 46 },
  "C": { h: 0, s: 47, v: 46 },
  "A": { h: 0, s: 0, v: 50 },
  "N": { h: 0, s: 0, v: 100 },
  "U": { h: 0, s: 0, v: 0 }
}

const groupNameFormating: Record<string, string> = {
  "P": "Pour",
  "C": "Contre",
  "A": "Abstention",
  "N": "Non-Votant",
  "U": "Absent"
}

const CaptionElem : React.FC<{name:string, color:Color}> = (props: {name:string, color:Color}) => {
  const iconsize = 15
  return <div key={props.name} className="elem">
    <svg className="img" width={iconsize} height={iconsize}>
      <circle
        style={{ fill: `hsl(${props.color.h},  ${props.color.s * 0.7}%, ${props.color.v}%)` }}
        r={iconsize / 2} cx={iconsize / 2} cy={iconsize / 2}
      />
    </svg>
    <div className="text">
      {props.name}
    </div>
  </div>
}

const ScrutinVisual = (idNameIndex: ScrutinsApi) => (scrutinId: string) => new class {

  f(s: DeputeApi) { return s.scrutins && (s.scrutins[scrutinId] || "U") }

  groupByScrutin() {
    return groupBy<DeputeApi>(s => this.f(s))
  }

  constructor() {
    Object.assign(window, { idNameIndex })
  }
 
  deputeColor(depute: DeputeApi) {
    return colors[this.f(depute)]
  }

  sort(sa: DeputeApi, sb: DeputeApi) {
    return this.f(sb).localeCompare(this.f(sa))
  }

  group(deputes: DeputeApi[]) {
    const groupes = Object.entries(deputes
      .reduce(this.groupByScrutin(), { "P": [], "C": [], "N": [], "A": [], "U": [] })
    )
    return { groupes, maxColSize: 10 }
  }

  formatGroupeName(groupeName: string) {
    return groupNameFormating[groupeName]
  }

  xAxisName() { return null }

  title() {
    const smallid = scrutinId.slice("VTANR5L15V".length)
    return <Fragment>
      {idNameIndex[scrutinId] + " "}
      <Link href={`https://www2.assemblee-nationale.fr/scrutins/detail/(legislature)/15/(num)/${smallid}`} variant="body2" target="_blank" rel="noreferrer">
        <FontAwesomeIcon icon={faExternalLinkAlt} />
      </Link>
    </Fragment>
  }

  caption() {
    //VTANR5L15V*3320*
    const smallid = scrutinId.slice("VTANR5L15V".length)
    return <foreignObject transform="scale(0.07)" width="350" height="400">
      <div className="undraggable">
        <div className="caption" >
          <style>{`
        .caption {
          color: white;
          padding: 10px;
          text-align: left;
        }

        .caption .elem {
          display: flex;
          flex-direction: row;
          align-items: center;
          margin-bottom: 5px;
        }

        .caption .elem .text {
        }

        .caption .elem .img {
          vertical-align: middle;
          margin: 2px 10px;
          width: 20px;
          flex: none
        }
      `}</style>

          <div style={{ marginBottom: "10px" }}>
            <Typography variant="body2">
              {idNameIndex[scrutinId] + "\u00a0"}

              <Link href={`https://www2.assemblee-nationale.fr/scrutins/detail/(legislature)/15/(num)/${smallid}`} variant="body2" target="_blank" rel="noreferrer">
                <FontAwesomeIcon icon={faExternalLinkAlt} />
              </Link>
            </Typography>
          </div>
          <CaptionElem name={groupNameFormating["P"]} color={colors["P"]} />
          <CaptionElem name={groupNameFormating["C"]} color={colors["C"]} />
          <CaptionElem name={groupNameFormating["A"]} color={colors["A"]} />
          <CaptionElem name={groupNameFormating["N"]} color={colors["N"]} />
          <CaptionElem name={groupNameFormating["U"]} color={colors["U"]} />
        </div>
      </div>
    </foreignObject >
  }

}()
export default ScrutinVisual
