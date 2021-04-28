import React from 'react';
import App from './App.jsx'

export type BDD = {scrutins: any, deputes: any, groupes: any, sieges: any}

interface Props {}
interface State {loading : boolean}

class LoadingScreen extends React.PureComponent<Props, State> {

  deputes: any | undefined
  scrutins: any | undefined
  sieges: any | undefined
  groupes: any | undefined


  constructor(props) {
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
    const bdd : BDD = this
    return <App bdd={bdd} />
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
