const { program } = require('commander');
const fs = require('fs');
const {downloadUnzip} = require('./misc/downloader.js')
const {isMissingThrow} = require('./misc/isMissing.js')

const data_link = "http://data.assemblee-nationale.fr/static/openData/repository/15/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes_XV.json.zip"

const d = {
  mkdir: true,
  override: false,
  verbose: false
}

var downloaded = false

async function downloadOnce(dlfolder, opt) {
  opt = Object.assign(d, opt)
  const unzipFolder = dlfolder + "/data.assemblee-nationale.fr/"
  if (!downloaded) {
    await downloadUnzip(data_link, unzipFolder, opt)
    downloaded = true
  }
}

async function fetchAnDataOf(depute, opt) {
  isMissingThrow(depute, {uid: true})
  return fetchAnData(depute.uid, opt)
}

async function fetchAnData(uid, opt) {
  downloadOnce(opt.dlfolder, opt)
  let opendatapath = opt.dlfolder + "/data.assemblee-nationale.fr/" + `/json/acteur/${uid}.json`;
  if (fs.existsSync(opendatapath)) {
    let rawdata = fs.readFileSync(opendatapath);
    let opendata = JSON.parse(rawdata);
    let ident = opendata["acteur"]["etatCivil"]["ident"];
    let infoNaissance = opendata["acteur"]["etatCivil"]["infoNaissance"];
    return {
      ident,
      femme: ident && (ident.civ !== "M."),
      nom: ident && `${ident.prenom} ${ident.nom}`,
      dateNais: infoNaissance && infoNaissance.dateNais
    }
  } else {
    opt.verbose && console.log(`No data found for ${uid} in ${opendatapath}`)
    return {}
  }
}

//node ./an_data.js -v --uid PA719922
async function main() {
  program
    .description(`Download the pic of the depute`)
    .option('-v, --verbose', 'log what\'s happening')
    .option('-f, --dlfolder <folder>' , 'download folder', "dl/")
    .option('--no-mkdir')
    .option('--override')
    .requiredOption('--uid <no>','')
    .parse(process.argv);
  const anDataFetcher = await anDataFetcherBuilder(program.dlfolder, program)
  console.log(await anDataFetcher.fetch(program.uid))
}

if (require.main === module) main()

module.exports = {fetchAnData, fetchAnDataOf}
