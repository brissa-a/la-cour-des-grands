import {PureComponent, Fragment, createRef} from 'react';
import { FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import { faAlignJustify, faSearch, faFileExport} from '@fortawesome/free-solid-svg-icons'
import { faPaypal, faGithub } from '@fortawesome/free-brands-svg-icons'
import './Search.css'
import config from './config.json'
import sieges from './sieges.json'
import Fuse from 'fuse.js'
import diacritics from 'diacritics'
import SearchResponse from './SearchResponse.js'

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
    const options = {
      // isCaseSensitive: false,
      includeScore: true,
      // shouldSort: true,
      includeMatches: true,
      findAllMatches: true,
      minMatchCharLength: 2,
      // location: 0,
      threshold: 0.28,
      //distance: 100,
      useExtendedSearch: true,
      //ignoreLocation: true,
      //ignoreFieldNorm: true,
      getFn: function() {
        const original = Fuse.config.getFn.apply(this, arguments)
        if (Array.isArray(original)) {
          return original.map(x => diacritics.remove(x))
        } else if(original)  {
          return diacritics.remove(original)
        } else {
          return original
        }
      },
      keys: [
        {name: "depute.ident.nom", weight: 10},
        {name: "depute.ident.prenom", weight: 10},
        "depute.circo.communes",
        {name:"depute.circo.departement", weight: 5},
        {name:"depute.circo.numDepartement", weight: 5},
        {name:"depute.circo.numCirco", weight: 5},
      ]
    };

    this.fuse = new Fuse(sieges, options);
  }

  componentDidMount() {
      document.addEventListener('mousedown', this.handleClickOutside.bind(this));
  }

  componentWillUnmount() {
      document.removeEventListener('mousedown', this.handleClickOutside.bind(this));
  }

  onChange(evt) {
    let cleanQuery = diacritics.remove(evt.target.value).split(" ").join(" | ")

    this.setState({
      text: evt.target.value
    });
    this.searchto && clearTimeout(this.searchto)
    this.searchto = setTimeout(() => {
      const resp = this.fuse.search(cleanQuery)
      const respDate = Date.now()
      this.setState({resp,respDate});
    }, 300)
  }

  handleClickOutside(event) {
      if (this.wrapperRef && this.wrapperRef.current && !this.wrapperRef.current.contains(event.target)) {
          this.setState({focused: false})
      }
  }

  exportSvg() {
    var svgElement = document.getElementById("mainsvg").cloneNode(true);
    svgElement.setAttribute("width", "1920");
    svgElement.setAttribute("height", "1080");
    svgElement.firstChild.setAttribute("transform", `translate(-0.04861094553469947, 0.26474552964222897) scale(0.02272727272727273)`);
    var svgUrl = 'data:image/svg+xml; charset=utf8, ' + encodeURIComponent(new XMLSerializer().serializeToString(svgElement))
    let bb = svgElement.getBoundingClientRect()

    let image = new Image();
    console.log({svgUrl, image})
    image.onload = () => {
       let canvas = document.createElement('canvas');
       const width = image.naturalWidth
       const height = image.naturalHeight
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
    var respElemList;

    if (this.state.resp) {
      let i = 0
      let top10 = this.state.resp.slice(0, 10);
      this.app.setHighlightSiegeIds(top10.map(x => x.item.siegeid))
      respElemList = top10.map(x => {
        const color = {
          h: 360 / top10.length * ++i,
          s: 50,
          v: 50
        }
        return <SearchResponse key={x.item.siegeid + this.state.respDate} item={x} color={color} app={this.app}/>
      })
      respElemList = respElemList.length ? respElemList : "..."
    }
    return <div className="search"  ref={this.wrapperRef}>
      <div className='input-container'>
        <FontAwesomeIcon size="lg" icon={faSearch}/> <input
          id="search" autocomplete="off" placeholder="Nom, Département, Code postale..."
          value={this.state.text}
          onChange={e => this.onChange(e)}
          onFocus={() => this.setState({focused: true})}
        />
      </div>
        <div>{this.state.focused ? respElemList : null}</div>
     </div>
  }

}

export default Search
