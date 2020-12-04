import React from 'react';
import groupes from './groupes.json'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExclamation } from '@fortawesome/free-solid-svg-icons'

class Siege extends React.Component {

  constructor(props) {
    super();
    this.showDetail = props.showDetail
    this.pinDetail = props.pinDetail
    this.removeDetail = props.removeDetail
    this.state = {
      ...props
    }
  }

  render() {
    // console.log(this.state.img)
    const warning = this.state.depute?.nom ? null : <g  transform="translate(-0.1, -0.7) scale(0.30)">
      <FontAwesomeIcon icon={faExclamation} color="red"/>
    </g>


    const imgsize = 1.2
    if (this.state.depute) {
      const color = groupes[this.state.depute.groupe].color
      return <g data-id={this.state.siegeno} transform={`translate(${this.state.pos.x}, ${this.state.pos.y})`}>
        <g  className="bloup">
          <clipPath id={this.state.siegeid+"-clippath"}>
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
              href={`/img/nobg/${this.state.siegeno}.png`}
              x={-imgsize/2}
              y={-imgsize/2}
              height={imgsize}
              width={imgsize}
              onMouseEnter={this.showDetail}
              onClick={this.pinDetail}
              onMouseLeave={this.removeDetail}
              clipPath={"url(#" + this.state.siegeid+"-clippath)"}
              data-depute={JSON.stringify(this.state.depute)}
          />
          {warning}
        </g>
      </g>
    } else if (this.state.siegeno >= 4000 && this.state.siegeno < 5000) {
      return <circle
        style={{fillOpacity: 0, stroke: "#FFCC77", strokeWidth: 0.03}}
         cx={this.state.pos.x}
         cy={this.state.pos.y}
         r={0.5}
         onMouseEnter={this.showDetail}
         onMouseLeave={this.removeDetail}
      />
    } else if (this.state.siegeno >= 3000 && this.state.siegeno < 4000) {
      return <circle
        style={{fillOpacity: 0, stroke: "#FFCC77", strokeWidth: 0}}
         cx={this.state.pos.x}
         cy={this.state.pos.y}
         r={0.5}
         onMouseEnter={this.showDetail}
         onMouseLeave={this.removeDetail}
      />
    } else {
      return <circle
        style={{fillOpacity: 0, stroke: "#ffffff", strokeWidth: 0.03}}
         cx={this.state.pos.x}
         cy={this.state.pos.y}
         r={0.5}
         onMouseEnter={this.showDetail}
         onMouseLeave={this.removeDetail}
      />
    }
  }

}

export default Siege
