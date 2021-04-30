import { groupBy } from '../functional';
import { Color, VisualColor, VisualLayout } from './VisualType';

const womanColor = {
  h:299, s:37, v:46
}
const menColor = {
  h:203, s:37, v:46
}

const CaptionElem: React.FC<{name:string, color:Color}> = (props) => {
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

const groupBySexe = groupBy((s: DeputeApi) => s.an_data_depute.femme ?  "femme" : "homme")

class SexeVisual implements VisualLayout, VisualColor {

  deputeColor(depute: DeputeApi) {
    return depute.an_data_depute.femme ? womanColor : menColor
  }

  sort(sa: DeputeApi, sb: DeputeApi) {
    return (sb.an_data_depute.femme ? 1 : 0) - (sa.an_data_depute.femme ? 1 : 0)
  }

  group(deputes: DeputeApi[]) {
    const groupes = Object.entries(
      deputes.reduce(groupBySexe, {"homme": [], "femme": []})
    )
    return {groupes, maxColSize: 10}
  }

  formatGroupeName(groupeName: string) {
    return groupeName
  }

  xAxisName() {return null}

  caption() {
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
      <div className="caption">
        <CaptionElem name="Homme" color={menColor}/>
        <CaptionElem name="Femme" color={womanColor}/>
      </div>
      </div>
    </foreignObject >
  }

}
 export default new SexeVisual()
