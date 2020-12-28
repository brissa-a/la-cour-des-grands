import {Fragment, Component} from 'react';
import groupes from './groupes.json'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExclamation } from '@fortawesome/free-solid-svg-icons'
import visuals from "./visual/all.js"

class Siege extends Component {

  constructor(props) {
    super();
    Object.assign(this, props)
    this.state = {
      showPic: true,
      visualname: visuals.default
    }

  }

  showPic(showPic) {
    this.setState({showPic})
  }

  setVisual(visualname) {
    this.setState({visualname})
  }

  render() {
    // console.log(this.siege.img)
    const warning = this.siege.depute?.nom ? null : <g  transform="translate(-0.1, -0.7) scale(0.30)">
      <FontAwesomeIcon icon={faExclamation} color="red"/>
    </g>


    const imgsize = 1.4
    if (this.siege.depute) {
      const visual = visuals.all[this.state.visualname]
      const color = visual.siegeColor(this.siege)

      const Pic = () => this.state.showPic ? <Fragment><circle
                 style={{fill: `hsl(${color.h},${color.s * 0.7}%,${color.v}%)`}}
                 r={0.53}
              />
              <clipPath id={this.siege.siegeid+"-clippath"}>
                <circle r="0.53"/>
              </clipPath>
              <image opacity={0.8}
                  href={`/depute-pic/${this.siege.depute.uid}.png`}
                  x={-imgsize/2}
                  y={-imgsize/2}
                  height={imgsize}
                  width={imgsize}
                  clipPath={"url(#" + this.siege.siegeid+"-clippath)"}
              /></Fragment> : null

      return <g data-id={this.siege.siegeno} data-color={JSON.stringify(color)}
        transform={`translate(${this.siege.pos.x}, ${this.siege.pos.y})`}
        onMouseEnter={() => this.app.showDetail(this.siege)}
        onClick={() => this.app.pinDetail(this.siege)}
      >
        <g  className="bloup">
          <circle
             style={{fill: `hsl(${color.h},${color.s * 0.7}%,${color.v}%)`}}
             r={0.53}
          />
          <Pic/>
          {warning}
        </g>
      </g>
    } else if (this.siege.siegeno >= 4000 && this.siege.siegeno < 5000) {
      return <circle
        style={{fillOpacity: 0, stroke: "#FFCC77", strokeWidth: 0.03}}
         cx={this.siege.pos.x}
         cy={this.siege.pos.y}
         r={0.5}
      />
    } else if (this.siege.siegeno >= 3000 && this.siege.siegeno < 4000) {
      return <circle
        style={{fillOpacity: 0, stroke: "#FFCC77", strokeWidth: 0}}
         cx={this.siege.pos.x}
         cy={this.siege.pos.y}
         r={0.5}
      />
    } else {
      return <circle
        style={{fillOpacity: 0, stroke: "#ffffff", strokeWidth: 0.03}}
         cx={this.siege.pos.x}
         cy={this.siege.pos.y}
         r={0.5}
      />
    }
  }

}

export default Siege
