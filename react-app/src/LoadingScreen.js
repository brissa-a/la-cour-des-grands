import React from 'react';
import App from './App.js'

class LoadingScreen extends React.PureComponent {

  constructor() {
    super()
    this.bdd = {}
    this.state = {
      loading: true
    }
  }

  refreshLoading() {
    if (this.bdd.scrutins && this.bdd.deputes && this.bdd.groupes && this.bdd.sieges) {
      this.setState({ loading: false })
    }
  }

  render() {
    const { loading } = this.state
    if (loading) return "Loading..."
    return <App bdd={this.bdd} />
  }

  componentDidMount() {
    fetch('https://raw.githubusercontent.com/brissa-a/lcdg-data/main/scrutins.json')
      .then(resp => resp.json())
      .then(json => {
        this.bdd.scrutins = json
        this.refreshLoading()
      })
    fetch('https://raw.githubusercontent.com/brissa-a/lcdg-data/main/deputes.json')
      .then(resp => resp.json())
      .then(json => {
        this.bdd.deputes = json
        this.refreshLoading()
      })
    fetch('/bdd/groupes.json')
      .then(resp => resp.json())
      .then(json => {
        this.bdd.groupes = json
        this.refreshLoading()
      })
    fetch('/bdd/sieges.json')
      .then(resp => resp.json())
      .then(json => {
        this.bdd.sieges = json
        this.refreshLoading()
      })
  }

}
export default LoadingScreen;
