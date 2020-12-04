import React from 'react';
import SiegeDetail from './SiegeDetail.js'
import Legende from './Legende.js'
import './App.css';
import MainSvg from './MainSvg.js'
import Footer  from './Footer.js'

class App extends React.Component {

  constructor() {
    super()
    this.state = {
      detail: null,
      pinned: null
    }
  }

  showDetail(siege) {
    this.setState({detail: siege})
  }

  pinDetail(siege) {
    this.setState({pinned: siege})
  }

  render() {
    const siege = this.state.detail || this.state.pinned
    const siegeispinned = (this.state.detail && this.state.pinned && this.state.detail.siegeno === this.state.pinned.siegeno)
    const pinned =  (!this.state.detail && this.state.pinned) || (this.state.detail && this.state.pinned && this.state.detail.siegeno === this.state.pinned.siegeno)
    return (
      <div className="App">
          <MainSvg showDetail={this.showDetail.bind(this)} pinDetail={this.pinDetail.bind(this)}/>
          <SiegeDetail {...siege} pinned={pinned} siegeispinned={siegeispinned}
          key={"s"+siege?.curSiege+"r"+siege?.curRowId + "detail" +  (pinned ? "-pinned" : "") + (siegeispinned ? "-siegeispinned" : "")}/>
          <Legende/>
          <Footer/>
      </div>
    );
  }
}
export default App;
