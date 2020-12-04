import React from 'react';
import groupes from './groupes.json'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBirthdayCake, faCouch, faThumbtack } from '@fortawesome/free-solid-svg-icons'
import { faTwitter, faFacebook } from '@fortawesome/free-brands-svg-icons'
import "./SiegeDetail.css"

class SiegeDetail extends React.Component {

  constructor(props) {
    super();
    console.log(props)
    this.state = {
      ...props
    }
    this.pinned = props.pinned
    this.siegeispinned = props.siegeispinned
  }

  getAge(birthDate) {
      var today = new Date();
      var age = today.getFullYear() - birthDate.getFullYear();
      var m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
      }
      return age;
  }

  render() {
    const scale = 0.9
    const svg = {w: 350, h: 197}
    const portrait = {w: 150, h: 192}
    let color = groupes[this.state.depute?.groupe]?.color
    if (!color) color = {h: 0, s: 100, v: 100}

    const birthdate = this.state.depute?.dateNais ? new Date(this.state.depute?.dateNais) : undefined
    const birthdateStr = birthdate?.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
    const age = birthdate && this.getAge(birthdate)

    const pin = this.pinned ? <g  className={"pin"+(this.siegeispinned?"-pinned":"")}>
      <FontAwesomeIcon icon={faThumbtack} color={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`}/>
    </g> : null

    let social = []
    const of = this.state.depute?.official_link
    social.push(
      <div key="official" className={of ? "" : "desaturated"}><a href={of} target="_blank" rel="noreferrer"><img alt="logo assemblée nationale" src="/asbntn.png" width="30px"/></a></div>
    )
    const fb = this.state.depute?.facebook_link
    social.push(
      <div key="fb" className={fb ? "" : "desaturated"}><a href={fb} target="_blank" rel="noreferrer"><FontAwesomeIcon  style={{color: "#4267B2"}} icon={faFacebook}/></a></div>
    )
    const twitter = this.state.depute?.twitter_link
    social.push(
      <div key="twitter" className={twitter ? "" : "desaturated"}><a href={twitter} target="_blank" rel="noreferrer"><FontAwesomeIcon style={{color: "#1DA1F2"}} icon={faTwitter}/></a></div>
    )
    const ndpt = this.state.depute?.nosdeputes_link
    social.push(
      <div key="nosdeputes" className={ndpt ? "" : "desaturated"}><a  href={ndpt}target="_blank" rel="noreferrer"><img alt="logo nosdeputes.fr" src="/favicon_nosdeputes.ico" width="30px"/></a></div>
    )

    return <div className="details">
    <div style={{color: "#FFFFFF"}}>
      <svg width={svg.w} height={svg.h}>
        <image href={`colonnade-avec-les-drapeaux.jpg`} />
        <g transform={`translate(${(svg.w - portrait.w * scale)/2}, ${(svg.h - portrait.h * scale)/2}) scale(${scale})`}>
          <clipPath id={this.state.siegeid+"-clippath-detail"}>
            <circle r="95" cx={portrait.w/2} cy={portrait.h/2}/>
          </clipPath>
          <image
              href={`/img/nobg/${this.state.siegeno}.png`}
              clipPath={"url(#" + this.state.siegeid+"-clippath-detail)"}
          />
          <circle
             r="95" cx={portrait.w/2} cy={portrait.h/2}
             fillOpacity="0" stroke={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`} strokeWidth={1}/>
             {pin}
        </g>
      </svg>
      <div className="social-bar">
        {social}
      </div>
      <p style={{display: "none"}}>${JSON.stringify(this.state)}</p>
      <h2>{this.state.depute?.nom || "Inconnue" }</h2>
      <dl className="small-details">
        <dt><FontAwesomeIcon icon={faBirthdayCake}/></dt><dd>{birthdateStr || "Inconnue"} {age && `(${age} ans)`}</dd>
        <dt><FontAwesomeIcon icon={faCouch}/></dt><dd>{this.state.siegeno}</dd>
      </dl>
      <dl className="big-details">
        <dt>Groupe</dt><dd>{this.state.depute?.groupe}</dd>
      </dl>
    </div>
    </div>
  }
}

export default SiegeDetail;
