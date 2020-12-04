import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify} from '@fortawesome/free-solid-svg-icons'
import { faPaypal, faGithub } from '@fortawesome/free-brands-svg-icons'
import './Footer.css'
import config from './config.json'

class Footer extends React.Component {

  constructor() {
    super()
    this.state = {}
  }

  toggle() {
    if (this.state.open) {
      this.setState({open: ""})
    } else {
      this.setState({open: "open"})
    }
  }

  render() {
    return <div className={`footer ${this.state.open}`}>
      <button onClick={this.toggle.bind(this)}>
        <FontAwesomeIcon size="lg" icon={faAlignJustify}/> Mentions légales
      </button>
      &nbsp;&nbsp;&nbsp;
      <a href={config.github_link}>
        <FontAwesomeIcon size="lg" icon={faGithub}/> Github
      </a>
      &nbsp;&nbsp;&nbsp;
      <a href={config.donation_link}>
        <FontAwesomeIcon size="lg" icon={faPaypal}/> Faire un don
      </a>
      <p style={{width: "330px"}}>Ce site est hébergé par Firebase, 188 King ST, San Francisco, CA 94107, United States, https://firebase.google.com/.</p>
    </div>
  }

}

export default Footer
