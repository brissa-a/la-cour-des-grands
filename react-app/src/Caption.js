import {PureComponent, Fragment, createRef} from "react"
import './Caption.css';
import visuals from "./visual/all.js"

class Caption extends PureComponent {

  constructor(props) {
    super();
  }

  render() {
    const {visualColor} = this.props
    const VisualCaption = props => visualColor.caption()
    return <g transform="translate(28,-33)">
      <foreignObject transform="scale(0.05)" width="350" height="400">
        <VisualCaption app={this.app}/>
      </foreignObject>
    </g>
  }

}



export default Caption
