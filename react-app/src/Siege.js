import React from 'react';
import groupes from './groupes.json'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExclamation } from '@fortawesome/free-solid-svg-icons'

class Siege extends React.Component {

  constructor(props) {
    super();
    Object.assign(this, props)
  }

  render() {
    // console.log(this.siege.img)
    const warning = this.siege.depute?.nom ? null : <g  transform="translate(-0.1, -0.7) scale(0.30)">
      <FontAwesomeIcon icon={faExclamation} color="red"/>
    </g>


    const imgsize = 1.2
    if (this.siege.depute) {
      const color = groupes[this.siege.depute.groupe].color
      return <g data-id={this.siege.siegeno} transform={`translate(${this.siege.pos.x}, ${this.siege.pos.y})`}>
        <g  className="bloup">
          <clipPath id={this.siege.siegeid+"-clippath"}>
            <circle r="0.5"/>
          </clipPath>
          <circle
             style={{fill: `hsl(${color.h},${color.s}%,${color.v}%)`}}
             r={0.53}
          />
          <circle
             style={{fill: `hsl(0, 0%, 0%, 0.6)`}}
             r={0.5}
          />
          <image
              href={`/depute-pic/${this.siege.depute.uid}.png`}
              x={-imgsize/2}
              y={-imgsize/2}
              height={imgsize}
              width={imgsize}
              onMouseEnter={() => this.app.showDetail(this.siege)}
              onClick={() => this.app.pinDetail(this.siege)}
              clipPath={"url(#" + this.siege.siegeid+"-clippath)"}
              data-json={JSON.stringify(this.siege.depute)}
          />
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
