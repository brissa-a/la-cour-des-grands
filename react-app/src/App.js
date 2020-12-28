import React from 'react';
import SiegeDetail from './SiegeDetail.js'
import './App.css';
import MainSvg from './MainSvg.js'
import Footer  from './Footer.js'
import sieges from './sieges.json'
import Search  from './Search.js'
import Actions  from './Actions.js'
import Panel  from './Panel.js'

const lightSchemeIcon = document.querySelector('link#light-scheme-icon');
const darkSchemeIcon = document.querySelector('link#dark-scheme-icon');
function handleDarkMode() {
  const darkModeOn = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (darkModeOn) {
    lightSchemeIcon.remove();
    document.head.append(darkSchemeIcon);
  } else {
    document.head.append(lightSchemeIcon);
    darkSchemeIcon.remove();
  }
}

class App extends React.Component {

  constructor() {
    super()
    this.sieges = sieges
    this.captionRef = React.createRef();
    var randomSiege;
    while (!randomSiege?.depute) randomSiege = sieges[Math.floor(Math.random() * sieges.length)];
    this.panelRef = React.createRef()
    this.state = {
      detail: randomSiege,
      pinned: null
    }
    window.sieges = sieges
  }

  showDetail(siege) {
    this.setState({detail: siege})
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

  render() {
    const siege = this.state.pinned || this.state.detail
    const key = siege.siegeid + "detail" + (this.state.pinned ? "-pinned" : "")
    return <div className="App">
      <MainSvg app={this}/>
      <SiegeDetail app={this} {...siege} pinned={this.state.pinned} key={key}/>
      <Search app={this}/>
      <Footer/>
      <Actions app={this}/>
      <Panel app={this} ref={this.panelRef}/>
    </div>
  }

  componentDidMount() {
      handleDarkMode();
  }

}
export default App;
