import React from 'react';
import DeputeDetail from './DeputeDetail'
import './App.css';
import DraggableSvg from './DraggableSvg'
import Footer  from './Footer'
import Search  from './Search.js'
import Panel  from './Panel.js'
import buildVisuals from "./visual/all"
import {DeputesRenderer} from './layout/Layout'
import Depute from './Depute'
import {TransitionGroup} from 'react-transition-group';
import {SvgOpacityTransition} from './SvgOpacityTransition.js'
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import blue from '@material-ui/core/colors/blue';
import grey from '@material-ui/core/colors/grey';
import CssBaseline from '@material-ui/core/CssBaseline';
import {BDD} from './LoadingScreen'
import { Visual, VisualColor, VisualLayout } from './visual/VisualType.js';

function handleDarkMode() {
  const favicons : NodeListOf<HTMLLinkElement> = document.querySelectorAll('head > link[rel="icon"][media]')
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

interface Props { bdd : BDD  }
interface State {
  detail: DeputeApi,
  pinned: DeputeApi | null,
  showPic: boolean,
  visualColorName: string,
  visualLayoutName: string,
  scrutinIdColor: string,
  scrutinIdLayout: string,
  panelOpen: boolean,
  highlightDeputeUids: string[],
}

export type UrlStateName = "visualLayoutName" | "visualColorName" | "scrutinIdColor" | "scrutinIdLayout" | "showPic"

class App extends React.PureComponent<Props, State> {

  visuals

  constructor(props : Props) {
    super(props)
    const {deputes} = props.bdd
    const visuals = buildVisuals(props.bdd)
    this.visuals = visuals
    let randomDepute;
    while (!randomDepute) randomDepute = deputes[Math.floor(Math.random() * deputes.length)];
    this.state = {
      detail: randomDepute,
      pinned: null,
      showPic: visuals.showPic,
      visualColorName: visuals.default.color,
      visualLayoutName: visuals.default.layout,
      scrutinIdColor: visuals.default.scrutinIdColor,
      scrutinIdLayout: visuals.default.scrutinIdLayout,
      panelOpen: false,
      highlightDeputeUids: []
    }
    window.deputes = deputes
    window.onpopstate = () => this.popState()
  }

  setHighlightDeputeIds(highlightDeputeUids: string[]) {
    this.setState({highlightDeputeUids})
  }

  showDetail(depute: any) {
    this.setState({detail: depute, highlightDeputeUids: [depute.uid]})
  }

  pinDetail(depute: DeputeApi | null) {
    if (depute === null && this.state.pinned) {
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

  showPic(show : boolean, pushState : boolean) {
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
      window.history.pushState(null, document.title, decodeURIComponent(`${window.location.pathname}?${params}`));
    }
  }

  getUrlState(name : UrlStateName) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name)
  }

  popState() {
      const params = new URLSearchParams(window.location.search);
      this.setVisualLayout(this.getUrlState("visualLayoutName") || this.visuals.default.layout, false)
      this.setVisualColor(this.getUrlState("visualColorName") || this.visuals.default.color, false)
      this.setScrutinIdLayout(this.getUrlState("scrutinIdLayout") || this.visuals.default.scrutinIdLayout, false)
      this.setScrutinIdColor(this.getUrlState("scrutinIdColor") || this.visuals.default.scrutinIdColor, false)
      this.showPic(this.getUrlState("showPic") === 'true' || this.visuals.showPic, false)
  }

  setUrlState(name: UrlStateName, value: string, pushHistory: boolean) {
    this.setState({[name]: value} as any)//Dirty
    if (pushHistory) {
      const params = new URLSearchParams(window.location.search);
      params.set(name, value);
      window.history.pushState(null, window.document.title, decodeURIComponent(`${window.location.pathname}?${params}`));
    }
  }

  setVisualLayout(name: string, pushState: boolean) {
    this.setUrlState("visualLayoutName", name, pushState)
  }

  setVisualColor(name: string, pushState: boolean) {
    this.setUrlState("visualColorName", name, pushState)
  }

  setScrutinIdColor(id: string, pushState: boolean) {
    this.setUrlState("scrutinIdColor", id, pushState)
  }

  setScrutinIdLayout(id: string, pushState: boolean) {
    this.setUrlState("scrutinIdLayout", id, pushState)
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
      ? this.visuals.colorsPerScrutin(scrutinIdColor)
      : this.visuals.colors[visualColorName] 
    const visual : ((deputes: DeputeApi[]) => Visual) = visualLayoutName === "perscrutin"
      ? this.visuals.layoutPerScrutin(scrutinIdLayout)(visualColor)
      : this.visuals.layouts[visualLayoutName](visualColor)
    const {Blueprint, Caption, deputeWithVisualProp} = visual(deputes)
    //DeputeRenderer to avoid react add/remove depute from DOM
    return <ThemeProvider theme={theme}><div className="App">
      <CssBaseline/>
      <DraggableSvg app={app}>
        <TransitionGroup component={null}><SvgOpacityTransition key={visualLayoutName}>
            <Blueprint />
        </SvgOpacityTransition></TransitionGroup>
        <TransitionGroup component={null}><SvgOpacityTransition key={visualColorName}>
            <Caption />
        </SvgOpacityTransition></TransitionGroup>
        <DeputesRenderer deputeWithVisualProp={deputeWithVisualProp}>
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
