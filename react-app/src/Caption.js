import {PureComponent, Fragment, createRef} from "react"
import './Caption.css';
import visuals from "./visual/all.js"

class Caption extends PureComponent {

  constructor(props) {
    super();
  }

  render() {
    const visual = visuals.all[this.props.visualname]
    const Caption = visual.caption.bind(visual)
    return <g transform="translate(28,-33)">
      <foreignObject transform="scale(0.05)" width="350" height="400">
        <Caption app={this.app}/>
      </foreignObject>
    </g>
  }

}



export default Caption
