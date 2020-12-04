import React from 'react';
import {Border, Tribune} from './SvgPath.js'
import Hemicycle from './Hemicycle.js'

class MainSvg extends React.Component {

  constructor(props) {
    super()
    this.svgRef = React.createRef();
    this.transformRef = React.createRef();
    this.showDetail = props.showDetail
    this.pinDetail = props.pinDetail
    this.transform = {
      scale: 0.022727272727272728,
      pos_x: 0.16749712817409856,
      pos_y: 0.24338615253986134
    }
  }

  startDrag(e) {
    this.draggedElement = this.transformRef.current;
    this.offset = this.clientCordToSvgCord(e, this.svgRef);
    this.offset.x -= this.transform.pos_x;
    this.offset.y -= this.transform.pos_y;
  }

  drag(e) {
    if (this.draggedElement) {
      const newpos = this.clientCordToSvgCord(e, this.svgRef)
      this.transform.pos_x = newpos.x - this.offset.x
      this.transform.pos_y = newpos.y - this.offset.y
      this.transformRef.current.setAttribute("transform", this.getTransformString());
    }
  }

  endDrag(e) {
    this.draggedElement = undefined
  }

  zoom(e) {
      const cursor = this.clientCordToSvgCord(e, this.svgRef)
      const scalefactor = e.deltaY < 0 ? 1 * 1.10 : 1 / 1.10
      const x = (cursor.x - this.transform.pos_x)
      const y = (cursor.y - this.transform.pos_y)
      const newscale = this.transform.scale * scalefactor
      if (newscale <= 0.5 && newscale >= 0.022 * 0.80) {
        this.transform.scale = newscale
        this.transform.pos_x = -x * scalefactor + cursor.x
        this.transform.pos_y = -y * scalefactor + cursor.y
        this.transformRef.current.setAttribute("transform", this.getTransformString());
      }
  }

  getCurrentViewBoxStr() {
    const screenRatio = 2
    const width = screenRatio
    const height = 1
    const viewBox = {
      min_x: -width/2,
      min_y: -height/2,
      width: width,
      height: height
    }
    const viewBoxStr = viewBox.min_x + " " + viewBox.min_y + " " +  viewBox.width + " " + viewBox.height
    //console.log(viewBoxStr)
    return viewBoxStr
  }

  getTransformString() {
    return `translate(${this.transform.pos_x}, ${this.transform.pos_y}) scale(${this.transform.scale})`
  }

  clientCordToSvgCord(evt, relativeTo) {
    var CTM = relativeTo.current.getScreenCTM();
    return {
      x: (evt.clientX - CTM.e) / CTM.a,
      y: (evt.clientY - CTM.f) / CTM.d
    };
  }

  render() {
    const html = <svg className="main"
      width="100%" height="100%" viewBox={this.getCurrentViewBoxStr()}
      ref={this.svgRef}
      onWheel={this.zoom.bind(this)}
      onMouseDown={this.startDrag.bind(this)}
      onTouchStart={this.startDrag.bind(this)}
      onMouseMove={this.drag.bind(this)}
      onTouchMove={this.drag.bind(this)}
      onMouseLeave={this.endDrag.bind(this)}
      onMouseUp={this.endDrag.bind(this)}
      onTouchEnd={this.endDrag.bind(this)}
    >
      <g
        ref={this.transformRef}
        transform={this.getTransformString()}
        style={{transition: "transform 0.1s"}}
      >
        <Border/>
        <Tribune/>
        <Hemicycle showDetail={this.showDetail.bind(this)} pinDetail={this.pinDetail.bind(this)}/>
      </g>
    </svg>
    return html
  }

}

export default MainSvg
