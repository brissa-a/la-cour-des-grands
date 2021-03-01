import React from 'react';
import DeputeDetail from './DeputeDetail.js'
import './App.css';
import DraggableSvg from './DraggableSvg.js'
import Footer  from './Footer.js'
import Search  from './Search.js'
import Panel  from './Panel.js'
import buildVisuals from "./visual/all.js"
import {DeputesRenderer} from './layout/Layout.js'
import Depute from './Depute.js'
import {TransitionGroup} from 'react-transition-group';
import {SvgOpacityTransition} from './SvgOpacityTransition.js'
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import blue from '@material-ui/core/colors/blue';
import grey from '@material-ui/core/colors/grey';
import CssBaseline from '@material-ui/core/CssBaseline';

function handleDarkMode() {
  const favicons = document.querySelectorAll('head > link[rel="icon"][media]')
  for (const fav of favicons) {
    if (window.matchMedia(fav.media).matches && fav.dataset.host === window.location.hostname) {
      //console.log({fav}, true)
    } else {
      fav.remove()
    }
  }
}

const theme = createMuiTheme({
  palette: {
    type: 'dark',
    primary: blue,
    background: {
      default: grey[900],
      paper: grey[900]
    },
  },
})

//#212121

class App extends React.PureComponent {

  constructor({bdd}) {
    super()
    const {deputes} = bdd
    const visuals = buildVisuals(bdd)
    this.visuals = visuals
    let randomDepute;
    while (!randomDepute) randomDepute = deputes[Math.floor(Math.random() * deputes.length)];
    this.state = {
      detail: randomDepute,
      pinned: null,
      showPic: visuals.showPic,
      visualColorName: visuals.default.color,
      visualLayoutName: visuals.default.layout,
      panelOpen: false,
      highlightDeputeUids: [],
      invertDepute: false,
      scrutinIdColor: visuals.default.scrutinIdColor,
      scrutinIdLayout: visuals.default.scrutinIdLayout
    }
    window.deputes = deputes
    window.onpopstate = function() {
      const params = new URLSearchParams(window.location.search);
      this.setVisual(params.get("visual") || visuals.default, false)
      this.showPic(params.get("showPic") === 'true' || visuals.showPic, false)
    }.bind(this);
  }

  setHighlightDeputeIds(highlightDeputeUids) {
    this.setState({highlightDeputeUids})
  }

  showDetail(depute) {
    this.setState({detail: depute, highlightDeputeUids: [depute.uid]})
  }

  pinDetail(depute) {
    if (depute === null) {
      //unpin case
      this.setState({
        detail: this.state.pinned,
        pinned: null
      })
    }  else {
      this.setState({
        pinned: depute
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

  setVisualLayout(name, pushState) {
    this.setState({
      visualLayoutName: name
    })
    if (pushState) {
      const params = new URLSearchParams(window.location.search);
      params.set("layout", name);
      window.history.pushState(null, null, decodeURIComponent(`${window.location.pathname}?${params}`));
    }
  }

  setVisualColor(name, pushState) {
    this.setState({
      visualColorName: name
    })
    if (pushState) {
      const params = new URLSearchParams(window.location.search);
      params.set("color", name);
      window.history.pushState(null, null, decodeURIComponent(`${window.location.pathname}?${params}`));
    }
  }

  
  setScrutinIdLayout(id, pushState) {
    this.setState({
      scrutinIdLayout: id
    })
    if (pushState) {
      const params = new URLSearchParams(window.location.search);
      params.set("scrutinIdLayout", id);
      window.history.pushState(null, null, decodeURIComponent(`${window.location.pathname}?${params}`));
    }
  }

  setScrutinIdColor(id, pushState) {
    this.setState({
      scrutinIdColor: id
    })
    if (pushState) {
      const params = new URLSearchParams(window.location.search);
      params.set("scrutinIdColor", id);
      window.history.pushState(null, null, decodeURIComponent(`${window.location.pathname}?${params}`));
    }
  }

  togglePanel() {
    this.setState({panelOpen: !this.state.panelOpen})
  }

  render() {
    const {bdd} = this.props
    const {deputes} = bdd
    const app = this;
    const {pinned,  highlightDeputeUids, showPic} = this.state
    const {visualLayoutName, visualColorName, scrutinIdLayout, scrutinIdColor} = this.state
    const depute = this.state.pinned || this.state.detail
    const key = depute.uid + "detail" + (this.state.pinned ? "-pinned" : "")

    const visualColor = visualColorName === "scrutin"
      ? this.visuals.colors[visualColorName](scrutinIdColor)
      : this.visuals.colors[visualColorName] 
    const visualLayout = visualLayoutName === "perscrutin"
      ? this.visuals.layouts[visualLayoutName](scrutinIdLayout)(visualColor)
      : this.visuals.layouts[visualLayoutName](visualColor)
    const {Blueprint, Caption, deputeWithVisualProp} = visualLayout(deputes)
    //DeputeRenderer to avoid react add/remove depute from DOM
    return <ThemeProvider theme={theme}><div className="App">
      <CssBaseline/>
      <DraggableSvg app={app}>
        <TransitionGroup component={null}><SvgOpacityTransition key={visualLayoutName}>
            <Blueprint />
        </SvgOpacityTransition></TransitionGroup>
        <TransitionGroup component={null}><SvgOpacityTransition key={visualColorName}>
            <Caption app={app} />
        </SvgOpacityTransition></TransitionGroup>
        <DeputesRenderer  app={app} deputeWithVisualProp={deputeWithVisualProp}>
          {({depute, visualProps}) => <Depute
             app={app} highlight={highlightDeputeUids.includes(depute.uid)}
             depute={depute} key={depute.uid}
             showPic={showPic}
             {...visualProps}
           />}
        </DeputesRenderer>
      </DraggableSvg>
      <DeputeDetail app={app} bdd={bdd} depute={depute} pinned={pinned} key={key}/>
      <Search app={app} bdd={bdd}/>
      <Footer/>
      <Panel app={app} visualLayoutName={visualLayoutName} visualColorName={visualColorName} open={true} showPic={showPic}/>
    </div></ThemeProvider>
  }

  componentDidMount() {
      handleDarkMode();
  }

}
export default App;
