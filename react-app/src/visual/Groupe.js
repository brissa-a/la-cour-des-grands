import { groupBy } from '../functional.js';

const GroupeVisual = groupes => new class {

  deputeColor(depute) {
    const { h, s, v } = groupes[depute.an_www_depute.groupe].color
    return {
      h, s: s * 0.8, v
    }
  }

  sort(da, db) {
    return da.an_www_depute.groupe.localeCompare(db.an_www_depute.groupe)
  }

  formatGroupeName(groupeName) {
    return groupeName
  }

  xAxisName() { return null }

  group(deputes) {
    const groupByGroupe = groupBy(s => s.an_www_depute.groupe)
    const groupes = Object.entries(
      deputes.reduce(groupByGroupe, {})
    )
      .sort(([gna, sa], [gnb, sb]) => sb.length - sa.length)
    return { groupes, maxColSize: 9 }
  }

  caption(props) {
    const GroupeLegendeElems = () => Object.keys(groupes).map(name => {
      const color = groupes[name].color
      const iconsize = 15
      return <div key={name} className="elem">
            <svg className="img" width={iconsize} height={iconsize}>
              <circle
                style={{ fill: `hsl(${color.h},  ${color.s * 0.8}%, ${color.v}%)` }}
                r={iconsize / 2} cx={iconsize / 2} cy={iconsize / 2}
              />
            </svg>
            <div className="text">
              {name}
            </div>
          </div>
    })

    return <foreignObject transform="scale(0.07)" width="300" height="450">
    <div className="undraggable">
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
      <div className="caption" xmlns="http://www.w3.org/1999/xhtml">
        <GroupeLegendeElems />
      </div>
      </div>
      </foreignObject>
  }

}
export default GroupeVisual
