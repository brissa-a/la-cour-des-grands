import groupe from "./Groupe.js"
import twitter from "./Twitter.js"
import age from "./AgeVisual.js"
import sexe from "./Sexe.js"
import scrutin from "./Scrutin.js"
import {Layout, hemicycle, chart} from "../layout/Layout.js"
import scrutins from '../scrutinIdScrutinName.index.json'

const params = new URLSearchParams(window.location.search)
//window.history.pushState({"html":response.html,"pageTitle":response.pageTitle},"", urlPath);

const scrutinIds = Object.keys(scrutins);

export default {
  layouts: {
    "hemicycle": hemicycle(),
    "pergroupe": chart(groupe),
    "perfollower": chart(twitter),
    "persexe": chart(sexe),
    "perage": chart(age),
    "perscrutin": scrutinId => chart(scrutin(scrutinId)),
  },
  colors: {groupe, twitter, sexe, age, scrutin: scrutinId => scrutin(scrutinId)},
  default: {
    layout: params.get("layout") || "hemicycle",
    color: params.get("color") || "groupe",
    scrutinIdLayout: params.get("scrutinIdLayout") || scrutinIds[Math.round(Math.random() * scrutinIds.length)-1],
    scrutinIdColor: params.get("scrutinIdColor") || scrutinIds[Math.round(Math.random() * scrutinIds.length)-1]
  },
  showPic: params.has("showPic") ? params.get("showPic") == 'true' : false
  // registerCallback: function(cb
  //   callbacks.push(cb)
  // },
  // removeCallback: function(cb) {
  //   callbacks = callbacks.filter(x => x != cb)
  // },
  // setVisual: function(visual) {
  //   for (let cb of callbacks) {
  //     cb(visual)
  //   }
  // }
}
