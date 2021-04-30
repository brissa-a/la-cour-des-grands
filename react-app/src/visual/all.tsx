import GroupeVisual from "./Groupe"
import TwitterVisual from "./Twitter.js"
import AgeVisual from "./AgeVisual"
import sexe from "./Sexe.js"
import ScrutinVisual from "./Scrutin"
import { hemicycle, chart } from "../layout/Layout"
import { BDD } from "../LoadingScreen.js"
import { LayoutBuilder, VisualColor, VisualLayout } from "./VisualType.js"

const params = new URLSearchParams(window.location.search)
//window.history.pushState({"html":response.html,"pageTitle":response.pageTitle},"", urlPath);

function buildVisuals(bdd: BDD) {
  const {scrutins, deputes, groupes, sieges} = bdd
  const scrutinIds = Object.keys(scrutins);
  const twitter = TwitterVisual(deputes)
  const age = AgeVisual(deputes)
  const groupe = GroupeVisual(groupes)
  const scrutin = ScrutinVisual(scrutins)
  const layouts : {[name: string]: LayoutBuilder} = {
    "hemicycle": hemicycle(sieges),
    "pergroupe": chart(groupe),
    "perfollower": chart(twitter),
    "persexe": chart(sexe),
    "perage": chart(age)
  }
  const layoutPerScrutin : (scrutinId: string) => LayoutBuilder = (scrutinId: string) => chart(scrutin(scrutinId))
  const colors : {[name: string]: VisualColor} = { groupe, twitter, sexe, age}
  const colorsPerScrutin : (scrutinId: string) => VisualColor = (scrutinId: string) => scrutin(scrutinId)
  return {
    layouts,
    layoutPerScrutin,
    colors,
    colorsPerScrutin,
    default: {
      layout: params.get("layout") || "hemicycle",
      color: params.get("color") || "groupe",
      scrutinIdLayout: params.get("scrutinIdLayout") || scrutinIds[Math.round(Math.random() * scrutinIds.length) - 1],
      scrutinIdColor: params.get("scrutinIdColor") || scrutinIds[Math.round(Math.random() * scrutinIds.length) - 1]
    },
    showPic: params.has("showPic") ? params.get("showPic") === 'true' : false
  }
}

export default buildVisuals