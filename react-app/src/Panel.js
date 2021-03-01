import { faPaintBrush, faProjectDiagram } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Box from "@material-ui/core/Box";
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Grid from '@material-ui/core/Grid';
import InputLabel from '@material-ui/core/InputLabel';
import ListSubheader from '@material-ui/core/ListSubheader';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import { withStyles } from "@material-ui/core/styles";
import Switch from '@material-ui/core/Switch';
import { PureComponent } from 'react';



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
      return <div className={[classes.root, "backdrop"].join(' ')}><Box m={0} p={1} boxShadow={2} bgcolor="none">
      <Grid
        container
        direction="row"
        justify="space-evenly"
        alignItems="center"
      >
      <FormControl className={classes.formControl}>
        <InputLabel id="demo-simple-select-label">Disposition <FontAwesomeIcon icon={faProjectDiagram}/></InputLabel>
        <Select
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={this.props.visualLayoutName}
           onChange={e => e.target.value && this.props.app.setVisualLayout(e.target.value, true)}
        >
          <MenuItem value={"hemicycle"}>Hemicycle</MenuItem>
          <ListSubheader value={"pergroupe"}>Graphique</ListSubheader>
          <MenuItem value={"pergroupe"}>Par groupe politique</MenuItem>
          <MenuItem value={"perfollower"}>Par twitter follower</MenuItem>
          <MenuItem value={"persexe"}>Par sexe</MenuItem>
          <MenuItem value={"perage"}>Par age</MenuItem>
          <MenuItem value={"perscrutin"}>Par scrutin</MenuItem>
        </Select>
      </FormControl>
      <FormControl className={classes.formControl}>
        <InputLabel id="demo-simple-select-label">Couleur <FontAwesomeIcon icon={faPaintBrush}/></InputLabel>
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
          <MenuItem value={"scrutin"}>Scrutin</MenuItem>
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
      </Grid></Box></div>
  }
}

export default withStyles(styles, { withTheme: true })(Panel);
