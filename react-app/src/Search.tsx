import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link, Typography } from '@material-ui/core';
import { ChangeEvent, createRef, PureComponent } from 'react';
import { BDD } from './LoadingScreen';
import './Search.css';
import SearchResponseElem from './SearchResponse';
import { buildIndex, search, Index as SearchIndex, SearchResponse } from "./searchAlgo";
import App from './App';

interface Props {app: App, bdd: BDD}
interface State {
  text: string,
  resp: SearchResponse[] | null,
  respDate: number | null,
  focused: boolean
 }

class Search extends PureComponent<Props, State> {

  wrapperRef = createRef<HTMLDivElement>();
  searchto?: NodeJS.Timeout;
  myIdx: SearchIndex;

  constructor(props: Props) {
    super(props)
    const {deputes, scrutins} = props.bdd
    this.state = {
      text: "",
      resp: null,
      respDate: null,
      focused: false
    }
    const myIdx = buildIndex(deputes, scrutins)
    this.myIdx = myIdx
    Object.assign(window, { myIdx })
    Object.assign(window, { search })
  }

  componentDidMount() {
    document.addEventListener('mousedown', e => this.handleClickOutside(e));
  }

  componentWillUnmount() {
    document.removeEventListener('mousedown', e => this.handleClickOutside(e));
  }

  onChange(evt: ChangeEvent<HTMLInputElement>) {
    this.setState({
      text: evt.target.value
    });
    if (this.myIdx) {
      this.searchto && clearTimeout(this.searchto)
      this.searchto = setTimeout(() => {
        const resp = search(this.myIdx, evt.target.value)
        const respDate = Date.now()
        this.setState({ resp, respDate });
      }, 300)
    }
  }

  handleClickOutside(event: MouseEvent) {
    if (this.wrapperRef && this.wrapperRef.current && event.target instanceof Node && !this.wrapperRef.current.contains(event.target)) {
      this.setState({ focused: false })
    }
  }

  render() {
    var respElemList;

    if (this.state.resp) {
      let top10 = this.state.resp.slice(0, 10);
      respElemList = top10.map(x => {
        return <div className="respelem"><SearchResponseElem bdd={this.props.bdd} key={x.ref + this.state.respDate} item={x} app={this.props.app} /></div>
      })
      respElemList = respElemList.length ? respElemList : <SearchTips></SearchTips>
    } else {
      respElemList = <SearchTips></SearchTips>
    }
    return <div className="search" ref={this.wrapperRef}>
      <div className='input-container'>
        <FontAwesomeIcon size="lg" icon={faSearch} /> <input
          id="search" autoComplete="off" placeholder="Rechercher un député ou un scrutin"
          value={this.state.text}
          onChange={e => this.onChange(e)}
          onFocus={() => this.setState({ focused: true })}
        />
      </div>
      <div>{this.state.focused ? respElemList : null}</div>
    </div>
  }

}

interface PropsST {}
interface StateST {}

class SearchTips extends PureComponent<PropsST, StateST> {

  constructor(props: Props) {
    super(props)
  }

  render() {
    return <div style={{ width: "440px", padding: "10px" }}><Typography variant="body2">
      Vous pouvez rechercher les députés par:
      <ul>
        <li>Nom/Prénom</li>
        <li>Nom ou numéro de département</li>
        <li>Par nom de ville ou code postal</li>
        <li>Par numéro de circonscription</li>
      </ul>
      <br />
      Et les scrutins par titre, tel qu'ils se trouvent dans la colonne 'object du scrutin' sur <Link href="https://www2.assemblee-nationale.fr/scrutins/liste/(legislature)/15">le site de l'assemblée </Link>
      Puis les sélectionner pour les visualiser en cliquant sur les icones.<br />
    </Typography>
    </div>
  }

}

export default Search
