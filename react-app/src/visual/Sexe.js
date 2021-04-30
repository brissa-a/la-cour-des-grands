import { groupBy } from '../functional.tsx';

const womanColor = {
  h:299, s:37, v:46
}
const menColor = {
  h:203, s:37, v:46
}

const CaptionElem = (props) => {
  const iconsize = 15
  return <div key={props.name} className="elem">
    <svg className="img" width={iconsize} height={iconsize}>
          <circle
             style={{fill: `hsl(${props.color.h},  ${props.color.s * 0.7}%, ${props.color.v}%)`}}
             r={iconsize/2} cx={iconsize/2} cy={iconsize/2}
          />
    </svg>
    <div className="text">
    {props.name}
    </div>
  </div>
}

const groupBySexe = groupBy(s => s.an_data_depute.femme ?  "femme" : "homme")

class SexeVisual {

  deputeColor(depute) {
    return depute.an_data_depute.femme ? womanColor : menColor
  }

  sort(sa, sb) {
    return sb.an_data_depute.femme - sa.an_data_depute.femme
  }

  group(deputes) {
    const groupes = Object.entries(
      deputes.reduce(groupBySexe, {"homme": [], "femme": []})
    )
    return {groupes, maxColSize: 10}
  }

  formatGroupeName(groupeName) {
    return groupeName
  }

  xAxisName() {return null}

  caption(props) {
    return       <foreignObject transform="scale(0.07)" width="125" height="450">
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
      <div className="caption"  xmlns="http://www.w3.org/1999/xhtml">
        <CaptionElem name="Homme" color={menColor}/>
        <CaptionElem name="Femme" color={womanColor}/>
      </div>
      </div>
    </foreignObject >
  }

}
 export default new SexeVisual()
