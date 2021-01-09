import {Fragment, PureComponent} from 'react';
import groupes from './groupes.json'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExclamation } from '@fortawesome/free-solid-svg-icons'
import visuals from "./visual/all.js"
import "./Siege.css"

class Siege extends PureComponent {

  constructor() {
    super();
  }

  render() {
    // console.log(siege.img)
    const {visualname, siege, showPic, app, highlight} = this.props
    const warning = siege.depute?.nom ? null : <g  transform="translate(-0.1, -0.7) scale(0.30)">
      <FontAwesomeIcon icon={faExclamation} color="red"/>
    </g>

    const imgsize = 1.4
    if (siege.depute) {
      const visual = visuals.all[visualname]
      const color = visual.siegeColor(siege)
      const hoverClass = highlight ? "hover" : ""
      // const filter = highlight ? "url(#f3)" : ""
      const stroke = highlight ? "hsla(31, 50%, 100%, 1)" : ""
      const Pic = () => showPic ? <Fragment>
              <clipPath id={siege.siegeid+"-clippath"}>
                <circle r="0.53"/>
              </clipPath>
              <image opacity={0.8}
                  href={`/depute-pic/${siege.depute.uid}.png`}
                  x={-imgsize/2}
                  y={-imgsize/2}
                  height={imgsize}
                  width={imgsize}
                  clipPath={"url(#" + siege.siegeid+"-clippath)"}
              /></Fragment> : null

      return <g data-id={siege.siegeno} data-color={JSON.stringify(color)}
        transform={`translate(${siege.pos.x}, ${siege.pos.y})`}
        onMouseEnter={() => app.showDetail(siege)}
        onClick={() => app.pinDetail(siege)}
      >
        <g  className={`bloup ${hoverClass}`}>
          <defs>
            <filter id="f3" x="-1" y="-1" width="300%" height="300%">
              <feGaussianBlur result="blurOut" in="SourceGraphic" stdDeviation="0.2" />
              <feColorMatrix result="matrixOut" in="blurOut" type="matrix"
              values="10 0 0 0 0 0 10 0 0 0 0 0 10 0 0 0 0 0 1 0" />
              <feBlend in="SourceGraphic" in2="matrixOut" mode="normal" />
            </filter>
            <filter id="blurMe">
             <feGaussianBlur in="SourceGraphic" stdDeviation="0.1"/>
            </filter>
          </defs>
          <circle className="color-transition"
             style={{fill: `hsl(${color.h},${color.s * 0.7}%,${color.v}%)`}}
             r={0.53} strokeWidth="0.05" fillOpacity="1" stroke={stroke}
          />
          <Pic/>
          {warning}
        </g>
      </g>
    } else if (siege.siegeno >= 4000 && siege.siegeno < 5000) {
      return <circle
        style={{fillOpacity: 0, stroke: "#FFCC77", strokeWidth: 0.03}}
         cx={siege.pos.x}
         cy={siege.pos.y}
         r={0.5}
      />
    } else if (siege.siegeno >= 3000 && siege.siegeno < 4000) {
      return <circle
        style={{fillOpacity: 0, stroke: "#FFCC77", strokeWidth: 0}}
         cx={siege.pos.x}
         cy={siege.pos.y}
         r={0.5}
      />
    } else {
      return <circle
        style={{fillOpacity: 0, stroke: "#ffffff", strokeWidth: 0.03}}
         cx={siege.pos.x}
         cy={siege.pos.y}
         r={0.5}
      />
    }
  }

}

export default Siege
