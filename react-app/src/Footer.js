import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify} from '@fortawesome/free-solid-svg-icons'
import { faPaypal, faGithub } from '@fortawesome/free-brands-svg-icons'
import './Footer.css'
import config from './config.json'
import Box from "@material-ui/core/Box";

class Footer extends React.PureComponent {

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
    return <div className={`footer ${this.state.open}`}><Box m={0} p={1} boxShadow={2} bgcolor="background.paper">
      <button onClick={this.toggle.bind(this)}>
        <FontAwesomeIcon size="" icon={faAlignJustify}/> Mentions légales
      </button>
      &nbsp;&nbsp;&nbsp;
      <a href={config.github_link}>
        <FontAwesomeIcon size="" icon={faGithub}/> Github
      </a>
      &nbsp;&nbsp;&nbsp;
      <a href={config.donation_link}>
        <FontAwesomeIcon size="" icon={faPaypal}/> Faire un don
      </a>
      <p style={{width: "290px"}}>Ce site est hébergé par Firebase, 188 King ST, San Francisco, CA 94107, United States, https://firebase.google.com/.</p>
    </Box></div>
  }

}

export default Footer
