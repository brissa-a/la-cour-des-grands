import React from 'react';
import Siege from './Siege.js'

class Hemicycle extends React.PureComponent {

  constructor(props) {
    super()
  }

  render() {
    const {highlightSiegeIds, visualname, showPic, app, sieges}  = this.props
    return sieges.map(s => {
      return <Siege app={app} highlight={highlightSiegeIds.includes(s.siegeid)} siege={s} key={s.siegeid} visualname={visualname}  showPic={showPic}/>
    });
  }

}

export default Hemicycle
