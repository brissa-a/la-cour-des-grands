import { faFacebook, faTwitter } from '@fortawesome/free-brands-svg-icons';
import { faBirthdayCake, faCouch, faThumbtack, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Box from "@material-ui/core/Box";
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import React from 'react';
import App from './App';
import "./DeputeDetail.css";
import { BDD } from './LoadingScreen';

function formatedFollowerCount(depute: DeputeApi) {
  if (depute?.twitter?.public_metrics?.followers_count) {
    return new Intl.NumberFormat('fr-FR')
      .format(depute?.twitter?.public_metrics?.followers_count)
  } else {
    return "Pas de compte twitter"
  }
}

interface Props {bdd:BDD, pinned: DeputeApi | null, depute: DeputeApi, app: App}
interface State {showmore: boolean}

class DeputeDetail extends React.PureComponent<Props, State> {

  pinned : DeputeApi | null

  constructor(props: Props) {
    super(props);
    //console.log(props)
    this.pinned = props.pinned
    this.state = {
      showmore: false
    }
  }

  getAge(birthDate: Date) {
    var today = new Date();
    var age = today.getFullYear() - birthDate.getFullYear();
    var m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  showMore() {
    this.setState({ showmore: true })
  }

  showLess() {
    this.setState({ showmore: false })
  }

  render() {
    const { depute, bdd } = this.props
    const { groupes } = bdd;
    const scale = 0.9
    const svg = { w: 350, h: 197 }
    const portrait = { w: 150, h: 192 }
    let color = groupes[depute.an_www_depute.groupe]?.color
    if (!color) color = { h: 0, s: 100, v: 100 }

    const birthdate = depute.an_data_depute.dateNais ? new Date(depute.an_data_depute.dateNais) : undefined
    const birthdateStr = birthdate?.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
    const age = birthdate && this.getAge(birthdate)
    const showClass = this.state.showmore ? "show" : "hide"
    const pin = this.pinned ? <g onClick={() => this.props.app.pinDetail(null)} style={{ cursor: "pointer" }}>
      <g className={"pin" + (this.pinned ? "-pinned" : "")}>
        <FontAwesomeIcon icon={faThumbtack} color={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`} />
      </g>
      <g className={`show-more ${showClass}`} >
        <FontAwesomeIcon icon={faTimes} color={`hsla(0,  0%, 0%, 0.5)`} />
      </g>
    </g> : null

    let social = []
    const of = depute.official_link
    social.push(
      <div key="official" className={of ? "" : "desaturated"}>
        <a href={of} target="_blank" rel="noreferrer"><img alt="logo assemblée nationale" src="/logo-gris.png" width="38px" /></a>
      </div>
    )
    const fb = depute.an_www_social.facebook_link
    social.push(
      <div key="fb" className={fb ? "" : "desaturated"}><a href={fb} target="_blank" rel="noreferrer"><FontAwesomeIcon style={{ color: "#4267B2" }} icon={faFacebook} /></a></div>
    )
    const twitter = depute.twitter_username.value && ("https://twitter.com/" + depute.twitter_username.value)
    social.push(
      <div key="twitter" className={twitter ? "" : "desaturated"}><a href={twitter} target="_blank" rel="noreferrer"><FontAwesomeIcon style={{ color: "#1DA1F2" }} icon={faTwitter} /></a></div>
    )
    const ndpt = depute.nosdeputes_link
    social.push(
      <div key="nosdeputes" className={ndpt ? "" : "desaturated"}><a href={ndpt} target="_blank" rel="noreferrer"><img alt="logo nosdeputes.fr" src="/favicon_nosdeputes.ico" width="30px" /></a></div>
    )
    //https://datan.fr/deputes/somme-80/depute_francois-ruffin
    const datan = depute.datan
    social.push(
      <div key="datan" className={ndpt ? "" : "desaturated"}>
        <a href={datan} target="_blank" rel="noreferrer"><img alt="logo nosdeputes.fr" src="/datan_favicon.ico" width="30px" /></a>
      </div>
    )

    return <div className="details backdrop"><Box style={{ height: "100%" }} m={0} p={0} boxShadow={2} bgcolor="none">
      <div style={{ color: "#FFFFFF" }}>
        <svg width={svg.w} height={svg.h} onMouseEnter={() => this.showMore()} onMouseLeave={() => this.showLess()}>
          <image href={`colonnade-avec-les-drapeaux.jpg`} />
          <g transform={`translate(${(svg.w - portrait.w * scale) / 2}, ${(svg.h - portrait.h * scale) / 2}) scale(${scale})`}>
            <clipPath id={depute.uid + "-clippath-detail"}>
              <circle r="95" cx={portrait.w / 2} cy={portrait.h / 2} />
            </clipPath>
            <image
              href={`https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/depute/${depute.uid}.webp`}
              clipPath={"url(#" + depute.uid + "-clippath-detail)"}
            />
            <circle
              r="95" cx={portrait.w / 2} cy={portrait.h / 2}
              fillOpacity="0" stroke={`hsla(${color.h},  ${color.s}%, ${color.v + 20}%, 0.5)`} strokeWidth={1} />
            {pin}
          </g>
        </svg>
        <p style={{ display: "none" }}>${JSON.stringify(this.state)}</p>
        <Typography gutterBottom variant="h5">
          <span className="ident-civ">{depute.an_data_depute.ident?.civ}</span> {depute.an_data_depute.nom || "Inconnue"}
        </Typography>
        <dl className="small-details">
          <dt><FontAwesomeIcon icon={faBirthdayCake} /></dt><dd>{birthdateStr || "Inconnue"} {age && `(${age} ans)`}</dd>
          <dt><FontAwesomeIcon icon={faCouch} /></dt><dd>{depute.an_www_depute.nosiege}</dd>
        </dl>
        <dl className="big-details">
          <dt>Circonscription</dt><dd>{depute.circo.departement} ({depute.circo.numDepartement}) circo n<sup>o</sup>{depute.circo.numCirco}</dd>
          <dt>Groupe</dt><dd>{depute.an_www_depute.groupe}</dd>
          <dt>Nombre de follower twitter</dt>
          <dd>{formatedFollowerCount(depute)}</dd>
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

export default DeputeDetail;
