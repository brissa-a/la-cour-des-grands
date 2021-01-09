import {PureComponent, Fragment, createRef} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faAlignJustify, faSearch, faFileExport,faCog} from '@fortawesome/free-solid-svg-icons'
import "./Panel.css"
import visuals from "./visual/all.js"

class Panel extends PureComponent {

  constructor(props) {
    super()
  }

  render() {
      if (!this.props.open) return null
      return <div className="panel card-panel z-depth-3 grey darken-3 " style={{color: "rgba(255, 255, 255, 0.9)"}} >
      Paramètres des visuels
      <form action="#">
      <p>
        <label>
          <input name="group1" type="radio" onChange={e => this.props.app.setVisual("groupe", true)} checked={this.props.visualname === "groupe"}/>
          <span>Groupe politique</span>
        </label>
      </p>
      <p>
        <label>
          <input name="group1" type="radio" onChange={e => this.props.app.setVisual("twitter", true)}  checked={this.props.visualname === "twitter"}/>
          <span>Twitter follower</span>
        </label>
      </p>
      <p>
        <label>
          <input name="group1" type="radio" onChange={e => this.props.app.setVisual("sexe", true)} checked={this.props.visualname === "sexe"}/>
          <span>Sexe</span>
        </label>
      </p>
      <p>
        <label>
          <input name="group1" type="radio" onChange={e => this.props.app.setVisual("age", true)} checked={this.props.visualname === "age"}/>
          <span>Age</span>
        </label>
      </p>
      </form>
        <div class="switch white-text">

         <label>
           Cacher photos
           <input type="checkbox" onChange={e => this.props.app.showPic(e.target.checked, true)} checked={this.props.showPic}/>
           <span class="lever"></span>
           Afficher photos
         </label>
       </div>
      </div>
  }
}

export default Panel
