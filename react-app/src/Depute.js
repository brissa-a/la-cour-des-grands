import { faExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Fragment, PureComponent } from 'react';
import "./Depute.css";

export class Siege extends PureComponent {

  constructor(props) {
    super();
  }

  render() {
    const { siege } = this.props
    if (siege.no >= 4000 && siege.no < 5000) {
      return <circle
        style={{ fillOpacity: 0, stroke: "#FFCC77", strokeWidth: 0.03 }}
        cx={siege.pos.x * 29}
        cy={siege.pos.y * 29}
        r={0.5}
      />
    } else if (siege.no >= 3000 && siege.no < 4000) {
      return <circle
        style={{ fillOpacity: 0, stroke: "#FFCC77", strokeWidth: 0 }}
        cx={siege.pos.x * 29}
        cy={siege.pos.y * 29}
        r={0.5}
      />
    } else {
      return <circle
        style={{ fillOpacity: 0, stroke: "#ffffff", strokeWidth: 0.03 }}
        cx={siege.pos.x * 29}
        cy={siege.pos.y * 29}
        r={0.5}
      />
    }
  }
}

class Depute extends PureComponent {

  constructor(props) {
    super();
  }

  render() {
    // console.log(siege.img)
    const { depute, showPic, app, highlight, x, y, h, s, v} = this.props
    const color = { h, s, v }
    const warning = depute.an_data_depute.nom ? null : <g transform="translate(-0.1, -0.7) scale(0.30)">
      <FontAwesomeIcon icon={faExclamation} color="red" />
    </g>

    const imgsize = 1.4
    const hoverClass = highlight ? "hover" : ""
    // const filter = highlight ? "url(#f3)" : ""
    const stroke = highlight ? "hsla(31, 50%, 100%, 1)" : ""
    const Pic = () => showPic ? <Fragment>
      <clipPath id={depute.uid + "-clippath"}>
        <circle r="0.53" />
      </clipPath>
      <image opacity={0.8}
        href={`https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/depute/${depute.uid}.webp`}
        x={-imgsize / 2}
        y={-imgsize / 2}
        height={imgsize}
        width={imgsize}
        clipPath={"url(#" + depute.uid + "-clippath)"}
      /></Fragment> : null
    const style = {
      transition: `transform ${Math.random() * 0.65 + 0.65}s ease ${Math.random() * 0.3 + 0.3}s`,
      transform: `translate(${x}px, ${y}px)`
    }
    //const debugpos = <text fontSize={0.2}>{sIdx + ":" + colIdx}</text>
    return <g style={style}
      data-id={depute.uid} data-color={JSON.stringify(color)}
      onMouseEnter={() => app.showDetail(depute)}
      onClick={() => app.pinDetail(depute)}
    >
      <g className={`bloup ${hoverClass}`}>
        <defs>
          <filter id="f3" x="-1" y="-1" width="300%" height="300%">
            <feGaussianBlur result="blurOut" in="SourceGraphic" stdDeviation="0.2" />
            <feColorMatrix result="matrixOut" in="blurOut" type="matrix"
              values="10 0 0 0 0 0 10 0 0 0 0 0 10 0 0 0 0 0 1 0" />
            <feBlend in="SourceGraphic" in2="matrixOut" mode="normal" />
          </filter>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.1" />
          </filter>
        </defs>
        <circle className="color-transition"
          style={{ fill: `hsl(${color.h},${color.s * 0.7}%,${color.v}%)` }}
          r={0.53} strokeWidth="0.05" fillOpacity="1" stroke={stroke}
        />
        <Pic />
        {warning}

      </g>
    </g>
  }


}

export default Depute
