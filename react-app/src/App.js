import React from 'react';
import SiegeDetail from './SiegeDetail.js'
import Legende from './Legende.js'
import './App.css';
import MainSvg from './MainSvg.js'
import Footer  from './Footer.js'
import sieges from './sieges.json'
import Search  from './Search.js'


class App extends React.Component {

  constructor() {
    super()
    this.sieges = sieges
    var randomDepute;
    while (!randomDepute) randomDepute = sieges[Math.floor(Math.random() * sieges.length)];
    this.state = {
      detail: randomDepute,
      pinned: null
    }
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
      <Legende/>
      <Footer/>
    </div>
  }
}
export default App;
