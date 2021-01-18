import React from 'react';
class MainSvg extends React.PureComponent {

  constructor(props) {
    super()
    //USe ref for perfomance purpose
    this.svgRef = React.createRef();
    this.transformRef = React.createRef();
    this.transform = {
      scale: 0.012828952955767671,
      pos_x: 0.23271609882570168,
      pos_y: 0.18932110016807063
    }
  }

  startDrag(e) {
    if (!e.target.closest("foreignObject")) {
      this.draggedElement = this.transformRef.current;
      this.offset = this.clientCordToSvgCord(e, this.svgRef);
      this.offset.x -= this.transform.pos_x;
      this.offset.y -= this.transform.pos_y;
    }
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
      if (newscale <= 0.5 && newscale >= 0.022 * 0.50) {
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
    const {app, visualname, showPic, highlightIds} =  this.props
    const html = <svg className="main" id="mainsvg" xmlns="http://www.w3.org/2000/svg"
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
        <g>
          {this.props.children}
        </g>
      </g>
    </svg>
    return html
  }

}

export default MainSvg
