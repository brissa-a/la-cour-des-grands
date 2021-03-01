const { program } = require('commander');
const fs = require('fs');
program
  .description(`index all groupe from deputes and generate random color`)
  .option('-i, --input-file <deputes file>' , 'deputes.json input file path', 'dl/deputes.json')
  .option('-o, --output-file <groupes file>' , 'groupes.json output file path', `dl/groupes.json`)

program.parse(process.argv);

let rawdata = fs.readFileSync(program.inputFile);
let deputes = JSON.parse(rawdata);
let groupes = {}

for (depute of deputes) {
  if (!groupes[depute.an_www_depute.groupe]) {
    groupes[depute.an_www_depute.groupe] = {}
  }

/*Generate random groupe color with 360/length hue degree*/
let length = Object.keys(groupes).length
let i = length
for (groupe in groupes)
  groupes[groupe] =   {
    color: {
      h: 360 / length * --i,
      s: 100,
      v: 50
    }
  }
}

if (require.main === module) {
  console.log("Running module main", module)
  let jsonstr = JSON.stringify(groupes, null, ' ');
  fs.writeFileSync(program.outputFile, jsonstr);
}
