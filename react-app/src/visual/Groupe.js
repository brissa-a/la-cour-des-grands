import {Fragment} from 'react';
import groupes from '../groupes.json'
import Chart from '../chart/GroupeChart.js'

class GroupeVisual {

  constructor() {
  }

  siegeColor(siege) {
    const {h,s,v} = groupes[siege.depute.groupe].color
    return  {
      h, s: s * 0.8, v
    }
  }

  chart(props) {
    return <Chart app={props.app} color={this.color}/>
  }

  caption(props) {
    const GroupeLegendeElems = () => Object.keys(groupes).map(name => {
      const color = groupes[name].color
      const iconsize = 15
      return <div key={name} className="elem">
        <svg className="img" width={iconsize} height={iconsize}>
              <circle
                 style={{fill: `hsl(${color.h},  ${color.s * 0.8}%, ${color.v}%)`}}
                 r={iconsize/2} cx={iconsize/2} cy={iconsize/2}
              />
        </svg>
        <div className="text">
        {name}
        </div>
      </div>
    })

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
        <GroupeLegendeElems/>
      </div>
    </Fragment>
  }

}
 export default new GroupeVisual
