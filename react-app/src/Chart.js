import {PureComponent, Fragment, createRef} from "react"
import './Caption.css';
import visuals from "./visual/all.js"

class Chart extends PureComponent {

  constructor(props) {
    super();
  }

  render() {
    const visual = visuals.colors[this.props.visualname]
    const VisualChart = visual.chart.bind(visual)
    return <g transform={`translate(${35}, ${-30})`} >
      <VisualChart app={this.props.app}/>
    </g>
  }
}



export default Chart
