import groupe from "./Groupe.js"
import twitter from "./Twitter.js"
import age from "./AgeVisual.js"
import sexe from "./Sexe.js"
import {Layout, hemicycle, chart} from "../layout/Layout.js"

const params = new URLSearchParams(window.location.search)
//window.history.pushState({"html":response.html,"pageTitle":response.pageTitle},"", urlPath);

// let callbacks = []

export default {
  layouts: {
    "hemicycle": hemicycle(),
    "pergroupe": chart(groupe),
    "perfollower": chart(twitter),
    "persexe": chart(sexe),
    "perage": chart(age),
  },
  colors: {groupe, twitter, sexe, age},
  default: {
    layout: params.get("layout") || "hemicycle",
    color: params.get("color") || "groupe"
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
