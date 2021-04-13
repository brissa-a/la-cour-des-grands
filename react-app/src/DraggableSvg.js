import { withStyles } from "@material-ui/core/styles";
import React from 'react';
import { meanBy } from 'lodash'

const styles = (theme) => ({
  root: {
    backgroundColor: theme.palette.background.default,
    letterSpacing: 0.001
  }
});

class DraggableSvg extends React.PureComponent {

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

  startDrag(e, cursor) {
    if (!e.target.closest(".undraggable")) {
      //console.log({ startDrag: e })
      //Fix drag weird behavior when text is selected inside a foreignObject
      window.getSelection().removeAllRanges();
      this.draggedElement = this.transformRef.current;
      this.svgRef.current.style.cursor = "grabbing"
      this.offset = cursor
      this.offset.x -= this.transform.pos_x;
      this.offset.y -= this.transform.pos_y;
    }
  }

  drag(e, cursor) {
    if (this.draggedElement) {
      //console.log({ drag: e })
      //if (e.type === 'touchmove') debugger;
      this.transform.pos_x = cursor.x - this.offset.x
      this.transform.pos_y = cursor.y - this.offset.y
      this.transformRef.current.setAttribute("transform", this.getTransformString());
    }
  }

  endDrag(e) {
    //console.log({ endDrag: e })
    this.svgRef.current.style.cursor = "grab"
    this.draggedElement = undefined
  }

  zoom(e, cursor, scalefactor) {
    const x = (cursor.x - this.transform.pos_x)
    const y = (cursor.y - this.transform.pos_y)
    const newscale = this.transform.scale * scalefactor
    if (newscale <= 0.5 && newscale >= 0.022 * 0.50) {
      this.transform.scale = newscale
      this.transform.pos_x = cursor.x - x * scalefactor 
      this.transform.pos_y = cursor.y - y * scalefactor
      this.offset = cursor
      this.offset.x -= this.transform.pos_x;
      this.offset.y -= this.transform.pos_y;
      this.transformRef.current.setAttribute("transform", this.getTransformString());
    }
  }

  getCurrentViewBoxStr() {
    const screenRatio = 2
    const width = screenRatio
    const height = 1
    const viewBox = {
      min_x: -width / 2,
      min_y: -height / 2,
      width: width,
      height: height
    }
    const viewBoxStr = viewBox.min_x + " " + viewBox.min_y + " " + viewBox.width + " " + viewBox.height
    //console.log(viewBoxStr)
    return viewBoxStr
  }

  getTransformString() {
    return `translate(${this.transform.pos_x}, ${this.transform.pos_y}) scale(${this.transform.scale})`
  }

  clientCordToSvgCord(clientX, clientY, relativeTo) {
    var CTM = relativeTo.current.getScreenCTM();
    return {
      x: (clientX - CTM.e) / CTM.a,
      y: (clientY - CTM.f) / CTM.d
    };
  }

  // const clientX = evt.clientX || meanBy(evt.touches, t => t.clientX)
  // const clientY = evt.clientY || meanBy(evt.touches, t => t.clientY)
  render() {
    const { classes } = this.props
    const html = <svg className={`main ${classes.root}`} id="mainsvg" xmlns="http://www.w3.org/2000/svg"
      width="100%" height="100%" viewBox={this.getCurrentViewBoxStr()}
      ref={this.svgRef}
      onWheel={e => {
        const cursor = this.clientCordToSvgCord(e.clientX, e.clientY, this.svgRef)
        this.zoom(e, cursor,e.deltaY < 0 ? 1 * 1.10 : 1 / 1.10)
      }}
      onMouseDown={e => {
        const cursor = this.clientCordToSvgCord(e.clientX, e.clientY, this.svgRef)
        this.startDrag(e, cursor)
      }}
      onMouseMove={e => {
        const cursor = this.clientCordToSvgCord(e.clientX, e.clientY, this.svgRef)
        this.drag(e, cursor)
      }}
      onMouseLeave={e => this.endDrag()}
      onMouseUp={e => this.endDrag()}
      onTouchStart={e => {
        const clientX = meanBy(e.touches, t => t.clientX)
        const clientY = meanBy(e.touches, t => t.clientY)
        const cursor = this.clientCordToSvgCord(clientX, clientY, this.svgRef)
        this.startDrag(e, cursor)
        if (e.touches.length >= 2) {
          this.prevTouchDist = norm(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY,
          )
        }
      }}
      onTouchMove={e => {
        const clientX = meanBy(e.touches, t => t.clientX)
        const clientY = meanBy(e.touches, t => t.clientY)
        const cursor = this.clientCordToSvgCord(clientX, clientY, this.svgRef)
        this.drag(e, cursor)
        if (e.touches.length >= 2) {
          const currentTouchDist = norm(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY,
          )
          this.zoom(e, cursor, currentTouchDist / this.prevTouchDist)
          this.prevTouchDist = currentTouchDist
        }
      }}
      onTouchEnd={e => {
        const clientX = meanBy(e.touches, t => t.clientX)
        const clientY = meanBy(e.touches, t => t.clientY)
        const cursor = this.clientCordToSvgCord(clientX, clientY, this.svgRef)
        if (e.touches.length > 0) {
          this.startDrag(e, cursor)
          if (e.touches.length >= 2) {
            this.prevTouchDist = norm(
              e.touches[1].clientX - e.touches[0].clientX,
              e.touches[1].clientY - e.touches[0].clientY,
            )
          }
        } else {
          this.endDrag(e)
        }
      }}
    >
      <g
        ref={this.transformRef}
        transform={this.getTransformString()}
      >
        <g>
          {this.props.children}
        </g>
      </g>
    </svg>
    return html
  }

}

function norm(x, y) {
  return Math.sqrt(x * x + y * y)
}

export default withStyles(styles, { withTheme: true })(DraggableSvg)
