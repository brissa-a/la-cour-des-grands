import React from 'react';
import SiegeDetail from './SiegeDetail.js'
import './App.css';
import MainSvg from './MainSvg.js'
import Footer  from './Footer.js'
import sieges from './sieges.json'
import Search  from './Search.js'
import Actions  from './Actions.js'
import Panel  from './Panel.js'
import visuals from "./visual/all.js"
import Hemicycle from './Hemicycle.js'
import Siege from './Siege.js'

import Chart from './Chart.js'

function handleDarkMode() {
  const favicons = document.querySelectorAll('head > link[rel="icon"][media]')
  for (const fav of favicons) {
    if (window.matchMedia(fav.media).matches && fav.dataset.host == window.location.hostname) {
      //console.log({fav}, true)
    } else {
      fav.remove()
    }
  }
}

class App extends React.PureComponent {

  constructor() {
    super()
    this.sieges = sieges
    var randomSiege;
    while (!randomSiege?.depute) randomSiege = sieges[Math.floor(Math.random() * sieges.length)];
    this.state = {
      detail: randomSiege,
      pinned: null,
      showPic: visuals.showPic,
      visualname: visuals.default,
      panelOpen: false,
      highlightSiegeIds: []
    }
    window.sieges = sieges
    window.onpopstate = function(event) {
      const params = new URLSearchParams(window.location.search);
      this.setVisual(params.get("visual") || visuals.default, false)
      this.showPic(params.get("showPic") == 'true' || visuals.showPic, false)
    }.bind(this);
  }

  setHighlightSiegeIds(highlightSiegeIds) {
    this.setState({highlightSiegeIds})
  }

  showDetail(siege) {
    this.setState({detail: siege, highlightSiegeIds: [siege.siegeid]})
  }

  pinDetail(siege) {
    if (siege === null) {
      //unpin case
      this.setState({
        detail: this.state.pinned,
        pinned: null
      })
    }  else {
      this.setState({
        pinned: siege
      })
    }
  }

  showPic(show, pushState) {
    this.setState({
      showPic: show
    })
    if (pushState) {
      const params = new URLSearchParams(window.location.search);
      if (show) {
        params.set("showPic", "true");
      } else {
        params.delete("showPic")
      }
      window.history.pushState(null, null, decodeURIComponent(`${window.location.pathname}?${params}`));
    }
  }


  setVisual(name, pushState) {
    this.setState({
      visualname: name
    })
    if (pushState) {
      const params = new URLSearchParams(window.location.search);
      params.set("visual", name);
      window.history.pushState(null, null, decodeURIComponent(`${window.location.pathname}?${params}`));
    }
  }

  togglePanel() {
    this.setState({panelOpen: !this.state.panelOpen})
  }

  render() {
    const app = this;
    const {pinned, visualname, panelOpen, highlightSiegeIds, showPic} = this.state
    const siege = this.state.pinned || this.state.detail
    const key = siege.siegeid + "detail" + (this.state.pinned ? "-pinned" : "")
    // const Sieges = () => sieges.map(s => {
    //   return <Siege app={app} highlight={highlightSiegeIds.includes(s.siegeid)} siege={s} key={s.siegeid} visualname={visualname}  showPic={showPic}/>
    // });
    // const Sieges = () => <Hemicycle  app={app} highlightSiegeIds={highlightSiegeIds} sieges={this.sieges} visualname={visualname}  showPic={showPic} />
    return <div className="App">
      <MainSvg app={app}>
        <Chart app={app} visualname={visualname} />
        <Hemicycle  app={app} highlightSiegeIds={highlightSiegeIds} sieges={this.sieges} visualname={visualname}  showPic={showPic} />
      </MainSvg>
      <SiegeDetail app={app} {...siege} pinned={pinned} key={key}/>
      <Search app={app}/>
      <Footer/>
      <Actions app={app}/>
      <Panel app={app} visualname={visualname} open={panelOpen} showPic={showPic}/>
    </div>
  }

  componentDidMount() {
      handleDarkMode();
  }

}
export default App;
