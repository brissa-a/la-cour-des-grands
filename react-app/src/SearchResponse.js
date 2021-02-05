import {PureComponent} from 'react';
import groupes from './groupes.json'
import {highlightArray, highlightField} from "./highlightAlgo.js"
import { Typography } from '@material-ui/core';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faPaintBrush, faProjectDiagram, faSearch} from '@fortawesome/free-solid-svg-icons'

class SearchResponse extends PureComponent {

  constructor(props) {
    super()
  }

  render() {
    const {ref} = this.props.item
    if (ref.startsWith("siege:")) {
      return <SiegeSearchResponse {...this.props}/>
    } else {
      return <ScrutinSearchResponse {...this.props}/>
    }
  }

}

class SiegeSearchResponse extends PureComponent {

  constructor(props) {
    super()
  }
   
  render() {
    const {item, metadata, score} = this.props.item
    const {app} = this.props
    //style={{ color: `hsl(${h},${s - 40}%, ${v}%)` }}
    const color = groupes[item.depute?.groupe]?.color
    const hglnom = highlightField(metadata, "depute.nom", color) || item.depute.nom
    const hgldep = highlightField(metadata, "depute.circo.departement", color) || item.depute.circo.departement
    const hglnodep = highlightField(metadata, "depute.circo.numDepartement", color) || item.depute.circo.numDepartement
    const hglnocirco = highlightField(metadata, "depute.circo.numCirco", color) || item.depute.circo.numCirco

    let hglcommunes = highlightArray(metadata, "depute.circo.communes", color) || []
    if (hglcommunes.length > 20) {
      hglcommunes = [...hglcommunes.slice(0, 19), `et ${hglcommunes.length - 19} autres...`]
    }

    const scale = 0.25
    const svg = {w: 50, h: 50}
    const portrait = {w: 150, h: 192}

    const CommuneListHtml = () => hglcommunes.length ? <div className="commune-list">{hglcommunes.map((x) =><div className="elem">{x}</div>)}</div> : null

    return <div className="deputeresp clickable" onMouseEnter={() => app.showDetail(item)} onClick={() => app.pinDetail(item)}>
      <div class="pic">
        <svg width={svg.w} height={svg.h}>
          <g transform={`translate(${(svg.w - portrait.w * scale)/2}, ${(svg.h - portrait.h * scale)/2}) scale(${scale})`}>
            <clipPath id={item.siegeid+"-clippath-detail"}>
              <circle r="95" cx={portrait.w/2} cy={portrait.h/2}/>
            </clipPath>
            <image
                href={`/depute-pic/${item.depute.uid}.png`}
                clipPath={"url(#" + item.siegeid+"-clippath-detail)"}
            />
            <circle
               r="95" cx={portrait.w/2} cy={portrait.h/2}
               fillOpacity="0" stroke={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`} strokeWidth={5}/>
          </g>
        </svg>
      </div>
      <div class="text">
        <div class="head">
          <div class="name">{hglnom}</div><div class="circo">{hgldep} ({hglnodep}) circo n<sup>o</sup>{hglnocirco}</div>
        </div>
        <CommuneListHtml/>
      </div>
    </div>
  }
}

class ScrutinSearchResponse extends PureComponent {

  constructor() {
    super()
  }

  render() {
    const {item, metadata, score} = this.props.item
    const {app} = this.props
    const titre = highlightField(metadata, "titre", {h:0, s:100, v:50}) || item.titre; 
    return <div class="respelem">
      <Typography variant="body2">{titre}</Typography>
      <div style={{padding: "10px"}} onClick={e => {
        app.setScrutinIdColor(item.id, true)
        app.setVisualColor("scrutin", true)
      }}>
        <div className="clickable">
        <FontAwesomeIcon size="lg" icon={faPaintBrush}/>
        </div>
      </div>
      <div style={{padding: "10px"}} onClick={e => {
        app.setScrutinIdLayout(item.id, true)
        app.setVisualLayout("perscrutin", true)
      }}>
        <div className="clickable">
        <FontAwesomeIcon size="lg" icon={faProjectDiagram}/>
        </div>
      </div>
    </div>
  }

}


export default SearchResponse
