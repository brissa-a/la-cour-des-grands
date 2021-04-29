import React from 'react';
import App from './App'

export type BDD = {scrutins: ScrutinApi[], deputes: DeputeApi[], groupes: GroupeApi[], sieges: SiegeApi[]}

interface Props {}
interface State {loading : boolean}

class LoadingScreen extends React.PureComponent<Props, State> {

  deputes?: DeputeApi[]
  scrutins?: ScrutinApi[]
  sieges?: SiegeApi[]
  groupes?: GroupeApi[]


  constructor(props : Props) {
    super(props)
    this.state = {
      loading: true
    }
  }

  refreshLoading() {
    if (this.scrutins && this.deputes && this.groupes && this.sieges) {
      this.setState({ loading: false })
    }
  }

  render() {
    const { loading } = this.state
    if (loading) return "Loading..."
    const {scrutins, groupes, sieges, deputes} = this
    if (scrutins && deputes && groupes && sieges) {
      const bdd : BDD = {scrutins, groupes, sieges, deputes}
      return <App bdd={bdd} />
    }
  }

  componentDidMount() {
    fetch('https://raw.githubusercontent.com/brissa-a/lcdg-data/main/scrutins.json')
      .then(resp => resp.json())
      .then(json => {
        this.scrutins = json
        this.refreshLoading()
      })
    fetch('https://raw.githubusercontent.com/brissa-a/lcdg-data/main/deputes.json')
      .then(resp => resp.json())
      .then(json => {
        this.deputes = json
        this.refreshLoading()
      })
    fetch('/bdd/groupes.json')
      .then(resp => resp.json())
      .then(json => {
        this.groupes = json
        this.refreshLoading()
      })
    fetch('/bdd/sieges.json')
      .then(resp => resp.json())
      .then(json => {
        this.sieges = json
        this.refreshLoading()
      })
  }

}
export default LoadingScreen;
