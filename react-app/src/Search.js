import { PureComponent, createRef, Fragment } from 'react';
import './Search.css'
import sieges from './sieges.json'
import scrutins from './scrutinIdScrutinName.index.json'
import { highlightArray, highlightField } from "./highlightAlgo.js"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import SearchResponse from './SearchResponse.js'
import { Typography, Link } from '@material-ui/core';
const { buildIndex, search } = require('./searchAlgo.js')

class Search extends PureComponent {

  constructor(props) {
    super()
    this.wrapperRef = createRef();
    Object.assign(this, props)
    this.state = {
      text: "",
      resp: null,
      respDate: null,
      focused: false
    }
    const myIdx = buildIndex(sieges, scrutins)
    Object.assign(this, { myIdx })
    Object.assign(window, { myIdx })
    Object.assign(window, { search })
  }

  componentDidMount() {
    document.addEventListener('mousedown', this.handleClickOutside.bind(this));
  }

  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleClickOutside.bind(this));
  }

  onChange(evt) {
    this.setState({
      text: evt.target.value
    });
    this.searchto && clearTimeout(this.searchto)
    this.searchto = setTimeout(() => {
      const resp = search(this.myIdx, evt.target.value)
      const respDate = Date.now()
      this.setState({ resp, respDate });
    }, 300)
  }

  handleClickOutside(event) {
    if (this.wrapperRef && this.wrapperRef.current && !this.wrapperRef.current.contains(event.target)) {
      this.setState({ focused: false })
    }
  }

  exportSvg() {
    var svgElement = document.getElementById("mainsvg").cloneNode(true);
    svgElement.setAttribute("width", "1920");
    svgElement.setAttribute("height", "1080");
    svgElement.firstChild.setAttribute("transform", `translate(-0.04861094553469947, 0.26474552964222897) scale(0.02272727272727273)`);
    var svgUrl = 'data:image/svg+xml; charset=utf8, ' + encodeURIComponent(new XMLSerializer().serializeToString(svgElement))

    let image = new Image();
    console.log({ svgUrl, image })
    image.onload = () => {
      let canvas = document.createElement('canvas');
      const width = image.naturalWidth
      const height = image.naturalHeight
      canvas.width = width;
      canvas.height = height;
      let ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      let pngUrl = canvas.toDataURL();
      console.log({ width, height, image, ctx, pngUrl })
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
    var respElemList;

    if (this.state.resp) {
      let top10 = this.state.resp.slice(0, 10);
      //console.log(top10)
      //this.app.setHighlightSiegeIds(top10.map(x => x.metadata.siegeid))
      respElemList = top10.map(x => {
        return <div class="respelem"><SearchResponse key={x.ref + this.state.respDate} item={x} app={this.app} /></div>
      })
      respElemList = respElemList.length ? respElemList : <SearchTips></SearchTips>
    } else {
      respElemList = <SearchTips></SearchTips>
    }
    return <div className="search" ref={this.wrapperRef}>
      <div className='input-container'>
        <FontAwesomeIcon size="lg" icon={faSearch} /> <input
          id="search" autocomplete="off" placeholder="Rechercher un député ou un scrutin"
          value={this.state.text}
          onChange={e => this.onChange(e)}
          onFocus={() => this.setState({ focused: true })}
        />
      </div>
      <div>{this.state.focused ? respElemList : null}</div>
    </div>
  }

}

class SearchTips extends PureComponent {

  constructor(props) {
    super()
  }

  render() {
    return <div style={{ width: "440px", padding: "10px"}}><Typography variant="body2">
      Vous pouvez rechercher les députés par:
      <ul>
        <li>Nom/Prénom</li>
        <li>Nom ou numéro de département</li>
        <li>Par nom de ville ou code postal</li>
        <li>Par numéro de circonscription</li>
      </ul>
      <br/>
      Et les scrutins par titre, tel qu'ils se trouvent dans la colonne 'object du scrutin' sur <Link href="https://www2.assemblee-nationale.fr/scrutins/liste/(legislature)/15">le site de l'assemblée </Link>
      Puis les sélectionner pour les visualiser en cliquant sur les icones.<br/>
    </Typography>
    </div>
  }

}

export default Search
