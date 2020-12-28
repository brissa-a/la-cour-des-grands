import {Component, Fragment, createRef} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faAlignJustify, faSearch, faFileExport,faCog} from '@fortawesome/free-solid-svg-icons'
import "./Panel.css"

class Panel extends Component {

  constructor(props) {
    super()
    this.state = {
      open: props.open,
      showPic: true,
      visualname: "groupe"
    }
    Object.assign(this, props)
  }

  toggle()  {
    this.setState({open: !this.state.open})
  }

  togglePic(e) {
    for (const siege of this.app.sieges) {
      siege?.hemicycleRef?.current?.showPic(e.target.checked)
    }
    this.setState({
      showPic: e.target.checked
    })
  }

  setVisual(e, name) {
    this.app.captionRef.current.setVisual(name)
    for (const siege of this.app.sieges) {
      siege?.hemicycleRef?.current?.setVisual(name)
    }
    this.setState({
      visualname: name
    })
  }

  render() {
      if (!this.state.open) return null
      return <div className="panel card-panel z-depth-3 grey darken-3 " style={{color: "rgba(255, 255, 255, 0.9)"}} >
      Paramètres des visuels
      <form action="#">
      <p>
        <label>
          <input name="group1" type="radio" onChange={e => this.setVisual(e, "groupe")} checked={this.state.visualname === "groupe"}/>
          <span>Groupe politique</span>
        </label>
      </p>
      <p>
        <label>
          <input name="group1" type="radio" onChange={e => this.setVisual(e, "twitter")}  checked={this.state.visualname === "twitter"}/>
          <span>Twitter follower</span>
        </label>
      </p>
      <p>
        <label>
          <input name="group1" type="radio" onChange={e => this.setVisual(e, "sexe")} checked={this.state.visualname === "sexe"}/>
          <span>Sexe</span>
        </label>
      </p>
      <p>
        <label>
          <input name="group1" type="radio" onChange={e => this.setVisual(e, "age")} checked={this.state.visualname === "age"}/>
          <span>Age</span>
        </label>
      </p>
      </form>
        <div class="switch white-text">

         <label>
           Cacher photos
           <input type="checkbox" onChange={e => this.togglePic(e)} checked={this.state.showPic}/>
           <span class="lever"></span>
           Afficher photos
         </label>
       </div>
      </div>
  }
}

export default Panel
