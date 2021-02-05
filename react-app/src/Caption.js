import { PureComponent, Fragment, createRef } from "react"
import visuals from "./visual/all.js"

class Caption extends PureComponent {

  constructor(props) {
    super();
  }

  render() {
    const { visualColor } = this.props
    const VisualCaption = props => visualColor.caption()
    return <g transform="translate(28,-33)">
      <VisualCaption app={this.app} />
    </g>
  }

}



export default Caption
