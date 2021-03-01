import { PureComponent } from "react";

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
