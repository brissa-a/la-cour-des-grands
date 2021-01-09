import {PureComponent, Fragment} from 'react';
import groupes from './groupes.json'

//TODO move to a misc module
function groupBy(get) {
  return (acc,x) => {
    acc = acc || {}
    const list = acc[get(x)] || []
    acc[get(x)] = [x, ...list]
    return acc
  }
}

class Search extends PureComponent {

  constructor(props) {
    super()
    Object.assign(this, props)
  }

  wrapMatch([head, ...tail], value, wrapper, last = 0) {
    if (head && head) {
      const [start, end] = head
      const normal = value.slice(last, start)
      const match = wrapper(value.slice(start, end+1))
      const remain = this.wrapMatch(tail, value, wrapper,end+1)
      return  <Fragment>{normal}{match}{remain}</Fragment>
    } else {
      return value.slice(last)
    }
  }

  render() {
    const oneresp = this.item
    const {h,s,v} = groupes[oneresp.item.depute?.groupe]?.color
    function highlightMatch({indices, key}, value) {
      return this.wrapMatch(indices, value, x => <span className="highlight" style={{color: `hsl(${h},${s - 40}%, ${v}%)`}}>{x}</span>)
    }
    const matchByKey = oneresp.matches.reduce(groupBy(x => x.key), {})
    // {
    //  "indices": [
    //   [1,1],[4, 4],[11,11],[14,15],[17,18]
    //  ],
    //  "value": "Saint-Joseph (Manche) (50700)",
    //  "key": "depute.circo.communes",
    //  "refIndex": 164
    // }
    function highlightKey(key) {
      const originalValue = key.split(".").reduce((acc,key) => acc[key], oneresp.item)
      if (Array.isArray(originalValue)) {
        const matches = matchByKey[key] || []
        return matches.map(match => highlightMatch.bind(this)(match, originalValue[match.refIndex]))
      } else {
        const [match, ...others] = matchByKey[key] || []
        others.length && console.warn("others present not expected")
        return match && highlightMatch.bind(this)(match, originalValue)
      }
    }

    const hglnom = highlightKey.bind(this)("depute.ident.nom") || oneresp.item.depute.ident.nom
    const hglprenom = highlightKey.bind(this)("depute.ident.prenom") || oneresp.item.depute.ident.prenom
    const hgldep = highlightKey.bind(this)("depute.circo.departement") || oneresp.item.depute.circo.departement
    const hglnodep = highlightKey.bind(this)("depute.circo.numDepartement") || oneresp.item.depute.circo.numDepartement
    const hglnocirco = highlightKey.bind(this)("depute.circo.numCirco") || oneresp.item.depute.circo.numCirco

    let hglcommunes = highlightKey.bind(this)("depute.circo.communes")
    if (hglcommunes.length > 20) {
      hglcommunes = [...hglcommunes.slice(0, 19), `et ${hglcommunes.length - 19} d'autres...`]
    }

    const scale = 0.25
    const svg = {w: 50, h: 50}
    const portrait = {w: 150, h: 192}
    let color = groupes[oneresp.item.depute?.groupe]?.color

    const CommuneListHtml = () => hglcommunes.length ? <div className="commune-list">{hglcommunes.map((x) =><div className="elem">{x}</div>)}</div> : null

    return <div className="respelem" onMouseEnter={() => this.app.showDetail(oneresp.item)} onClick={() => this.app.pinDetail(oneresp.item)}>
      <div class="pic">
        <svg width={svg.w} height={svg.h}>
          <g transform={`translate(${(svg.w - portrait.w * scale)/2}, ${(svg.h - portrait.h * scale)/2}) scale(${scale})`}>
            <clipPath id={oneresp.item.siegeid+"-clippath-detail"}>
              <circle r="95" cx={portrait.w/2} cy={portrait.h/2}/>
            </clipPath>
            <image
                href={`/depute-pic/${oneresp.item.depute.uid}.png`}
                clipPath={"url(#" + oneresp.item.siegeid+"-clippath-detail)"}
            />
            <circle
               r="95" cx={portrait.w/2} cy={portrait.h/2}
               fillOpacity="0" stroke={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`} strokeWidth={5}/>
          </g>
        </svg>
      </div>
      <div class="text">
        <div class="head">
          <div class="name">{hglprenom} {hglnom}</div><div class="circo">{hgldep} ({hglnodep}) circo n<sup>o</sup>{hglnocirco}</div>
        </div>
        <CommuneListHtml/>
      </div>
    </div>
  }
}

export default Search
