import { withStyles } from "@material-ui/core/styles";
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import FormHelperText from '@material-ui/core/FormHelperText';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Select from '@material-ui/core/Select';
import Switch from '@material-ui/core/Switch';
import Box from "@material-ui/core/Box";
import Typography from '@material-ui/core/Typography';
import ScopedCssBaseline from '@material-ui/core/ScopedCssBaseline';
import ListSubheader from '@material-ui/core/ListSubheader';
import Grid from '@material-ui/core/Grid';

import {PureComponent, Fragment, createRef} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faAlignJustify, faSearch, faFileExport,faCog} from '@fortawesome/free-solid-svg-icons'
import visuals from "./visual/all.js"


const styles = (theme) => ({
  root: {
    position: "fixed",
    top: "0px",
    right: "0px",
    width: "425px"
  },
  formControl: {
    margin: theme.spacing(1),
    minWidth: "20ch"
  },
});

class Panel extends PureComponent {

  constructor(props) {
    super()
  }

  render() {
      if (!this.props.open) return null
      const { classes } = this.props;
      return <div className={classes.root}><ScopedCssBaseline><Box m={0} p={1} boxShadow={2} bgcolor="background.paper" color="color">
      <Grid
        container
        direction="row"
        justify="space-evenly"
        alignItems="center"
      >
      <FormControl className={classes.formControl}>
        <InputLabel id="demo-simple-select-label">Disposition</InputLabel>
        <Select
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={this.props.visualLayoutName}
           onChange={e => this.props.app.setVisualLayout(e.target.value, true)}
        >
          <MenuItem value={"hemicycle"}>Hemicycle</MenuItem>
          <ListSubheader>Graphique</ListSubheader>
          <MenuItem value={"pergroupe"}>Par groupe politique</MenuItem>
          <MenuItem value={"perfollower"}>Par twitter follower</MenuItem>
          <MenuItem value={"persexe"}>Par sexe</MenuItem>
          <MenuItem value={"perage"}>Par age</MenuItem>
        </Select>
      </FormControl>
      <FormControl className={classes.formControl}>
        <InputLabel id="demo-simple-select-label">Couleur</InputLabel>
        <Select
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={this.props.visualColorName}
           onChange={e => this.props.app.setVisualColor(e.target.value, true)}
        >
          <MenuItem value={"groupe"}>Groupe politique</MenuItem>
          <MenuItem value={"twitter"}>Twitter follower</MenuItem>
          <MenuItem value={"sexe"}>Sexe</MenuItem>
          <MenuItem value={"age"}>Age</MenuItem>
        </Select>
      </FormControl>
      <FormControlLabel
        control={
          <Switch
            checked={this.props.showPic}
            onChange={e => this.props.app.showPic(e.target.checked, true)}
            name="Idk"
            color="primary"
          />
        }
        label="Afficher photos"
      />
      </Grid></Box></ScopedCssBaseline></div>
  }
}

export default withStyles(styles, { withTheme: true })(Panel);
