import {Component, Fragment, createRef} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faAlignJustify, faSearch, faFileExport,faCog} from '@fortawesome/free-solid-svg-icons'
import "./Actions.css"

class Actions extends Component {

  constructor(props) {
    super()
    Object.assign(this, props)
  }

  exportSvg() {
    var svgElement = document.getElementById("mainsvg").cloneNode(true);
    const [width, height] = [1920, 1080]
    svgElement.setAttribute("width", width);
    svgElement.setAttribute("height", height);
    svgElement.firstChild.setAttribute("transform", `translate(-0.04861094553469947, 0.26474552964222897) scale(0.02272727272727273)`);
    var svgUrl = 'data:image/svg+xml; charset=utf8, ' + encodeURIComponent(new XMLSerializer().serializeToString(svgElement))
    let image = new Image();
    console.log({svgUrl, image})
    image.onload = () => {
       let canvas = document.createElement('canvas');
       canvas.width = width;
       canvas.height = height;
       let ctx = canvas.getContext('2d');
       ctx.drawImage(image, 0, 0, width, height);
      let pngUrl = canvas.toDataURL();
      console.log({width, height, image, ctx, pngUrl})
      //https://stackoverflow.com/questions/27798126/how-to-open-the-newly-created-image-in-a-new-tab
      var img = new Image();
      img.src = pngUrl
      img.style.backgroundColor = '#333333'
      var w = window.open(pngUrl);
      w.document.write(img.outerHTML);
    };
    image.src = svgUrl;
  }

  render() {
    return <div class="actions">
    <a class="btn-floating btn-large waves-effect waves-light" onClick={() => this.app.togglePanel()}>
      <FontAwesomeIcon size="lg" icon={faCog} />
    </a>
    <a style={{display: "none"}} class="btn-floating btn-large waves-effect waves-light" onClick={() => this.exportSvg()}>
      <FontAwesomeIcon size="lg" icon={faFileExport} />
    </a>
    </div>
  }

}

export default Actions
