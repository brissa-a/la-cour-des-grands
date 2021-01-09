import groupe from "./Groupe.js"
import twitter from "./Twitter.js"
import age from "./AgeVisual.js"
import sexe from "./Sexe.js"

const params = new URLSearchParams(window.location.search)
//window.history.pushState({"html":response.html,"pageTitle":response.pageTitle},"", urlPath);

// let callbacks = []

export default {
  all: {groupe, twitter, sexe, age},
  default: params.get("visual") || "groupe",
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
