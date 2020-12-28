import React from 'react';
import Siege from './Siege.js'

class Hemicycle extends React.Component {

  constructor(props) {
    super()
    Object.assign(this, props)
    for (const siege of this.app.sieges) {
      siege.hemicycleRef = React.createRef()
      siege.hemicycleHtml = <Siege app={this.app} ref={siege.hemicycleRef} siege={siege} key={siege.siegeid}/>
    }
  }

  render() {
    return this.app.sieges.map(s => s.hemicycleHtml)
  }

}

export default Hemicycle
