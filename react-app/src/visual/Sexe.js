import {Fragment} from 'react';
import Chart from '../chart/SexeChart.js'

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

class SexeVisual {

  constructor() {

  }

  siegeColor(siege) {
    return siege.depute.femme ? womanColor : menColor
  }

  chart(props) {
    return <Chart app={props.app} color={this.color}/>
  }

  caption(props) {
    return <Fragment>
      <style>{`
        .caption {
          color: white;
          padding: 10px;
          text-align: left;
          font-family: 'Segoe UI'
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
    </Fragment>
  }

}
 export default new SexeVisual
