import React from 'react';
import Siege from './Siege.js'

import deputes from './deputes.json'
import layout from "./layout.js"

class Hemicycle extends React.Component {

  constructor(props) {
    super()
    this.sieges = this.deputeWithSiege()
    this.showDetail = props.showDetail
    this.pinDetail = props.pinDetail
  }

  deputeWithSiege() {
    const sieges = []
    const interRowSpace = 1.8
    const t = this
    const rows = layout
    this.bySiegeno = {}
    for (const depute of deputes) {
      this.bySiegeno[depute.nosiege]=depute
    }
    //Turn ["1-3"] to [[1,2,3]]
    const unpackedrows = rows.map(row => row.flatMap(bloc => {
      const startend = bloc.split('-')
      const start = Number.parseInt(startend[0])
      const end = Number.parseInt(startend[1])
      const size = end - start + 1
      const unpacked = [...Array(size).keys()].map(i => i + start)
      return unpacked
    }))
    unpackedrows.forEach(function (row, curRowId) {
      const siegePerRow = row.length
      const angleStep = Math.PI / (siegePerRow - 1)
      for (let curSiege = 0; curSiege < siegePerRow; curSiege++) {
        const cursiegeno = row[curSiege]
        const curdepute = t.bySiegeno[cursiegeno]
        const siege = {
          pos: {
            x: Math.cos(curSiege * angleStep) * (curRowId + 5) * interRowSpace,
            y: -Math.sin(curSiege * angleStep) * (curRowId + 5) * interRowSpace
          },
          curSiege: curSiege,
          curRowId: curRowId,
          msg:"s"+curSiege+ "r"+curRowId,
          depute: curdepute,
          siegeid: "s"+curSiege+ "r"+curRowId,
          siegeno: cursiegeno
        }
        sieges.push(siege)
      }
    })
    return sieges;
  }

  render() {
    const t = this
    const siegeElems = this.sieges.map(siege => {
      return React.createElement(Siege, {
        ...siege,
        key: siege.siegeid,
        showDetail: () => t.showDetail(siege),
        pinDetail: () => t.pinDetail(siege),
        removeDetail: () => t.showDetail(null)
      })
    });
    return siegeElems
  }

}

export default Hemicycle
