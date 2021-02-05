import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { CssBaseline, Typography, Link } from '@material-ui/core';
import { Fragment } from 'react';
import { groupBy } from '../functional.js'
import idNameIndex from '../scrutinIdScrutinName.index.json'

const colors = {
  "P": { h: 101, s: 47, v: 46 },
  "C": { h: 0, s: 47, v: 46 },
  "A": { h: 0, s: 0, v: 50 },
  "N": { h: 0, s: 0, v: 100 },
  "U": { h: 0, s: 0, v: 0 }
}

const groupNameFormating = {
  "P": "Pour",
  "C": "Contre",
  "A": "Abstention",
  "N": "Non-Votant",
  "U": "Absent"
}

const CaptionElem = (props) => {
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



function minMaxRange(list, getter) {
  if (getter) list = list.map(getter)
  const min = Math.min(...list)
  const max = Math.max(...list)
  const range = max - min
  const avg = list.reduce((a, b) => a + b, 0) / list.length
  return { min, max, range, avg }
}

const ScrutinVisual = scrutinId => new class {

  f(s) { return s.depute?.scrutins && s.depute?.scrutins[scrutinId] || "U" }

  groupByScrutin() {
    return groupBy(s => this.f(s))
  }

  constructor() {
    Object.assign(window, { idNameIndex })
  }

  siegeColor(siege) {
    return colors[this.f(siege)]
  }

  sort(sa, sb) {
    return this.f(sb) - this.f(sa)
  }

  group(sieges) {
    const groupes = Object.entries(sieges
      .filter(s => s.depute)
      .reduce(this.groupByScrutin(), { "P": [], "C": [], "N": [], "A": [], "U": [] })
    )
    return { groupes, maxColSize: 10 }
  }

  formatGroupeName(groupeName) {
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

  caption(props) {
    //VTANR5L15V*3320*
    const smallid = scrutinId.slice("VTANR5L15V".length)
    return <foreignObject transform="scale(0.07)" width="350" height="400">
      <div class="undraggable">
        <div className="caption" xmlns="http://www.w3.org/1999/xhtml">
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

}
export default ScrutinVisual
