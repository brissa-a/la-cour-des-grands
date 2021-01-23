import React from 'react';
import groupes from './groupes.json'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBirthdayCake, faCouch, faThumbtack, faMap, faTimes } from '@fortawesome/free-solid-svg-icons'
import { faTwitter, faFacebook } from '@fortawesome/free-brands-svg-icons'
import "./SiegeDetail.css"
import Box from "@material-ui/core/Box";
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

function formatedFollowerCount(depute) {
  if (depute?.twitterByUsername?.public_metrics?.followers_count) {
    return new Intl.NumberFormat('fr-FR')
      .format(depute?.twitterByUsername?.public_metrics?.followers_count)
  } else {
    return "Pas de compte twitter"
  }
}

class SiegeDetail extends React.PureComponent {

  constructor(props) {
    super();
    //console.log(props)
    Object.assign(this, props)
    this.pinned = props.pinned
    this.state = {
      showmore: false
    }
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

  showMore() {
    this.setState({showmore: true})
  }

  showLess() {
    this.setState({showmore: false})
  }

  render() {
    const scale = 0.9
    const svg = {w: 350, h: 197}
    const portrait = {w: 150, h: 192}
    let color = groupes[this.depute?.groupe]?.color
    if (!color) color = {h: 0, s: 100, v: 100}

    const birthdate = this.depute?.dateNais ? new Date(this.depute?.dateNais) : undefined
    const birthdateStr = birthdate?.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
    const age = birthdate && this.getAge(birthdate)
    const showClass = this.state.showmore ? "show" : "hide"
    const pin = this.pinned ? <g onClick={() => this.app.pinDetail(null)} style={{cursor: "pointer"}}>
      <g className={"pin"+(this.pinned ? "-pinned":"")}>
        <FontAwesomeIcon icon={faThumbtack} color={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`}/>
      </g>
      <g className={`show-more ${showClass}`} >
        <FontAwesomeIcon icon={faTimes} color={`hsla(0,  0%, 0%, 0.5)`}/>
      </g>
    </g> : null

    let social = []
    const of = this.depute?.official_link
    social.push(
      <div key="official" className={of ? "" : "desaturated"}>
        <a href={of} target="_blank" rel="noreferrer"><img alt="logo assemblée nationale" src="/asbntn.png" width="30px"/></a>
      </div>
    )
    const fb = this.depute?.facebook_link
    social.push(
      <div key="fb" className={fb ? "" : "desaturated"}><a href={fb} target="_blank" rel="noreferrer"><FontAwesomeIcon  style={{color: "#4267B2"}} icon={faFacebook}/></a></div>
    )
    const twitter = this.depute?.nd_twitter?.twitter && ("https://twitter.com/" + this.depute?.twitter_username)
    social.push(
      <div key="twitter" className={twitter ? "" : "desaturated"}><a href={twitter} target="_blank" rel="noreferrer"><FontAwesomeIcon style={{color: "#1DA1F2"}} icon={faTwitter}/></a></div>
    )
    const ndpt = this.depute?.nosdeputes_link
    social.push(
      <div key="nosdeputes" className={ndpt ? "" : "desaturated"}><a  href={ndpt}target="_blank" rel="noreferrer"><img alt="logo nosdeputes.fr" src="/favicon_nosdeputes.ico" width="30px"/></a></div>
    )
    //https://datan.fr/deputes/somme-80/depute_francois-ruffin
    const nomDep = this.depute?.circo.departement.toLowerCase()
    const numDep = this.depute?.circo.numDepartement
    const datan = this.depute?.datan
    social.push(
      <div key="datan" className={ndpt ? "" : "desaturated"}>
        <a  href={datan} target="_blank" rel="noreferrer"><img alt="logo nosdeputes.fr" src="/datan_favicon.ico" width="30px"/></a>
      </div>
    )

    return <div className="details backdrop"><Box style={{height: "100%"}} m={0} p={0} boxShadow={2} bgcolor="none">
    <div style={{color: "#FFFFFF", display: this.depute ? "block" : "none"}}>
      <svg width={svg.w} height={svg.h} onMouseEnter={() => this.showMore()} onMouseLeave={() => this.showLess()}>
        <image href={`colonnade-avec-les-drapeaux.jpg`} />
        <g transform={`translate(${(svg.w - portrait.w * scale)/2}, ${(svg.h - portrait.h * scale)/2}) scale(${scale})`}>
          <clipPath id={this.siegeid+"-clippath-detail"}>
            <circle r="95" cx={portrait.w/2} cy={portrait.h/2}/>
          </clipPath>
          <image
              href={`/depute-pic/${this.depute.uid}.png`}
              clipPath={"url(#" + this.siegeid+"-clippath-detail)"}
          />
          <circle
             r="95" cx={portrait.w/2} cy={portrait.h/2}
             fillOpacity="0" stroke={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`} strokeWidth={1}/>
           {pin}
        </g>
      </svg>
      <p style={{display: "none"}}>${JSON.stringify(this.state)}</p>
      <h5>
        <Typography gutterBottom variant="h5" component="h2">
          <span class="ident-civ">{this.depute?.ident?.civ}</span> {this.depute?.nom || "Inconnue" }
        </Typography>
      </h5>
      <dl className="small-details">
        <dt><FontAwesomeIcon icon={faBirthdayCake}/></dt><dd>{birthdateStr || "Inconnue"} {age && `(${age} ans)`}</dd>
        <dt><FontAwesomeIcon icon={faCouch}/></dt><dd>{this.siegeno}</dd>
      </dl>
      <dl className="big-details">
        <dt>Circonscription</dt><dd>{this.depute?.circo.departement} ({this.depute?.circo.numDepartement}) circo n<sup>o</sup>{this.depute?.circo.numCirco}</dd>
        <dt>Groupe</dt><dd>{this.depute?.groupe}</dd>
        <dt>Nombre de follower twitter</dt>
          <dd>{formatedFollowerCount(this.depute)}</dd>
      </dl>
      <div className="social-bar">
        <Grid
          container
          direction="row"
          justify="space-evenly"
          alignItems="center"
        >
          {social}
        </Grid>
      </div>
    </div>
    </Box></div>
  }
}

export default SiegeDetail;
