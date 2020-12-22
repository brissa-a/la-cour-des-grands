import React from 'react';
import Siege from './Siege.js'

class Hemicycle extends React.Component {

  constructor(props) {
    super()
    Object.assign(this, props)
  }

  render() {
    const t = this
    const siegeElems = this.app.sieges.map(siege => {
      return <Siege app={this.app} siege={siege} key={siege.siegeid}/>
    });
    return siegeElems
  }

}

export default Hemicycle
