import GroupeVisual from "./Groupe.js"
import TwitterVisual from "./Twitter.js"
import AgeVisual from "./AgeVisual.js"
import sexe from "./Sexe.js"
import ScrutinVisual from "./Scrutin.js"
import { hemicycle, chart } from "../layout/Layout.js"

const params = new URLSearchParams(window.location.search)
//window.history.pushState({"html":response.html,"pageTitle":response.pageTitle},"", urlPath);


function buildVisuals(bdd) {
  const {scrutins, deputes, groupes, sieges} = bdd
  const scrutinIds = Object.keys(scrutins);
  const twitter = TwitterVisual(deputes)
  const age = AgeVisual(deputes)
  const groupe = GroupeVisual(groupes)
  const scrutin = ScrutinVisual(scrutins)
  return {
    layouts: {
      "hemicycle": hemicycle(sieges)(),
      "pergroupe": chart(groupe),
      "perfollower": chart(twitter),
      "persexe": chart(sexe),
      "perage": chart(age),
      "perscrutin": scrutinId => chart(scrutin(scrutinId)),
    },
    colors: { groupe, twitter, sexe, age, scrutin: scrutinId => scrutin(scrutinId) },
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