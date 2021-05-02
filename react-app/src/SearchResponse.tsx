import { faPaintBrush, faProjectDiagram } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Typography } from '@material-ui/core';
import { PureComponent } from 'react';
import App from './App';
import { highlightArray, highlightField } from "./highlightAlgo";
import { BDD } from './LoadingScreen';
import { ScrutinItem, SearchResponse as SearchResp, SearchResults } from './searchAlgo';


interface Props {bdd: BDD, item: SearchResp, app: App}
interface State {}

class SearchResponse extends PureComponent<Props, State> {

  constructor(props: Props) {
    super(props)
  }

  render() {
    const {ref} = this.props.item
    if (ref.startsWith("depute:")) {
      return <DeputeSearchResponse {...this.props}/>
    } else {
      return <ScrutinSearchResponse {...this.props}/>
    }
  }

}

interface PropsDSR {bdd: BDD, item: SearchResp, app: App}
interface StateDSR {}

class DeputeSearchResponse extends PureComponent<PropsDSR, StateDSR> {

  constructor(props: PropsDSR) {
    super(props)
  }
   
  render() {
    const {groupes} = this.props.bdd
    const item = this.props.item.item as DeputeApi
    const metadata = this.props.item.metadata
    const {app} = this.props
    //style={{ color: `hsl(${h},${s - 40}%, ${v}%)` }}
    const color = groupes[item.an_www_depute.groupe]?.color

    const hglnom = highlightField(metadata, "an_data_depute.nom", color) || item.an_data_depute.nom
    const hgldep = highlightField(metadata, "circo.departement", color) || item.circo.departement
    const hglnodep = highlightField(metadata, "circo.numDepartement", color) || item.circo.numDepartement
    const hglnocirco = highlightField(metadata, "circo.numCirco", color) || item.circo.numCirco

    let hglcommunes = highlightArray(metadata, "circo.communes", color) || []
    if (hglcommunes.length > 20) {
      hglcommunes = [...hglcommunes.slice(0, 19), `et ${hglcommunes.length - 19} autres...`]
    }

    const scale = 0.25
    const svg = {w: 50, h: 50}
    const portrait = {w: 150, h: 192}

    const CommuneListHtml = () => hglcommunes.length ? <div className="commune-list">{hglcommunes.map((x) =><div className="elem">{x}</div>)}</div> : null

    return <div className="deputeresp clickable" onMouseEnter={() => app.showDetail(item)} onClick={() => app.pinDetail(item)}>
      <div className="pic">
        <svg width={svg.w} height={svg.h}>
          <g transform={`translate(${(svg.w - portrait.w * scale)/2}, ${(svg.h - portrait.h * scale)/2}) scale(${scale})`}>
            <clipPath id={item.uid+"-clippath-detail"}>
              <circle r="95" cx={portrait.w/2} cy={portrait.h/2}/>
            </clipPath>
            <image
                href={`https://raw.githubusercontent.com/brissa-a/lcdg-data/main/img-nobg/${item.uid}.png`}
                clipPath={"url(#" + item.uid+"-clippath-detail)"}
            />
            <circle
               r="95" cx={portrait.w/2} cy={portrait.h/2}
               fillOpacity="0" stroke={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`} strokeWidth={5}/>
          </g>
        </svg>
      </div>
      <div className="text">
        <div className="head">
          <div className="name">{hglnom}</div><div className="circo">{hgldep} ({hglnodep}) circo n<sup>o</sup>{hglnocirco}</div>
        </div>
        <CommuneListHtml/>
      </div>
    </div>
  }
}

interface PropsSSR {bdd: BDD, item: SearchResp, app: App}
interface StateSSR {}

class ScrutinSearchResponse extends PureComponent<PropsSSR, StateSSR> {

  render() {
    const item = this.props.item.item as ScrutinItem
    const metadata = this.props.item.metadata
    const {app} = this.props
    const titre = highlightField(metadata, "titre", {h:0, s:100, v:50}) || item.titre; 
    return <div className="respelem">
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
