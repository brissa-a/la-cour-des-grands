import { PureComponent } from "react";
import { VisualColor } from "./visual/VisualType";

interface Props {visualColor: VisualColor}
interface State {}

class Caption extends PureComponent<Props, State> {

  constructor(props : Props) {
    super(props);
  }

  render() {
    const { visualColor } = this.props
    const VisualCaption : React.FC = props => visualColor.caption()
    return <g transform="translate(28,-33)">
      <VisualCaption />
    </g>
  }

}



export default Caption
