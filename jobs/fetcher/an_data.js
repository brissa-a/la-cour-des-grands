const { program } = require('commander');
const fs = require('fs');
const {downloadUnzip} = require('./misc/downloader.js')
const {isMissingThrow} = require('./misc/isMissing.js')
const path = require('path');
const glob = require('fast-glob');
const { map, each, flowAsync, also, flow, flatMap, groupBy, forOwn} = require('../mylodash.js');
const { readFileSync } = require('fs');

const an_data_folder = "data.assemblee-nationale.fr"

const acteurEtOrgane = {
  url: "http://data.assemblee-nationale.fr/static/openData/repository/15/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes_XV.json.zip",
  dest: [an_data_folder, "acteurOrgane"].join("/")
}
const vote = {
  url: "https://data.assemblee-nationale.fr/static/openData/repository/15/loi/scrutins/Scrutins_XV.json.zip",
  dest: [an_data_folder, "vote"].join("/")
}

async function fetchAnDataOf(depute, opt) {
  isMissingThrow(depute, {uid: true})
  return fetchOrganeActeur(depute.uid, opt)
}

const forceArray = x => Array.isArray(x) ? x : [x]

function buildDeputeScrutinIndex(votes) {
  const deputeScrutinIndex = {}
  for (const vote of votes)  {
    for (const groupe of vote.scrutin.ventilationVotes.organe.groupes.groupe) {
      const decomptes = groupe.vote.decompteNominatif
      let nonVotants = forceArray(decomptes.nonVotants?.votant || [])
      for (const {acteurRef} of nonVotants) {
        const perTitre = deputeScrutinIndex[acteurRef] || {}
        perTitre[vote.scrutin.uid] = "N"
        deputeScrutinIndex[acteurRef] = perTitre
      }
      const pours = forceArray(decomptes.pours?.votant || [])
      //console.log({decomptes, pours})
      for (const {acteurRef} of pours) {
        const perTitre = deputeScrutinIndex[acteurRef] || {}
        perTitre[vote.scrutin.uid] = "P"
        deputeScrutinIndex[acteurRef] = perTitre
      }
      const contres = forceArray(decomptes.contres?.votant || [])
      for (const {acteurRef} of contres) {
        const perTitre = deputeScrutinIndex[acteurRef] || {}
        perTitre[vote.scrutin.uid] = "C"
        deputeScrutinIndex[acteurRef] = perTitre
      }
      const abstentions = forceArray(decomptes.abstentions?.votant || [])
      for (const {acteurRef} of abstentions) {
        const perTitre = deputeScrutinIndex[acteurRef] || {}
        perTitre[vote.scrutin.uid] = "A"
        deputeScrutinIndex[acteurRef] = perTitre
      }
    }
  }
  return deputeScrutinIndex
}

function buildScrutinIdScrutinNameIndex(votes) {
  console.log("Building scrutin.id -> scrutin.name index")
  const scrutinIdScrutinNameIndex = {}
  for (const vote of votes)  {
    scrutinIdScrutinNameIndex[vote.scrutin.uid] = vote.scrutin.titre
  }
  return scrutinIdScrutinNameIndex
}

async function createDeputeScrutinIndex(opt, indexDest) {
  const {verbose} = opt
  const deputeScrutinIndex = await flowAsync([
    () => downloadUnzip(vote.url, [opt.dlfolder, vote.dest].join("/"), opt),
    () => [opt.dlfolder, vote.dest, `json`, `*.json`].join('/'),
    globPattern => glob(globPattern),
    map(filename => readFileSync(filename)),
    map(str => JSON.parse(str)),
    // dlUnzipSelect(
    //   url = vote.url,
    //   dest = [opt.dlfolder, vote.dest].join("/"),
    //   globPattern = [`json`, `*.json`].join('/'),
    //   opt
    // )
    //also(x => verbose && console.log(x[0])),
    buildDeputeScrutinIndex
  ])()

  let deputeScrutinIndexJson = JSON.stringify(deputeScrutinIndex);
  console.log(`saving in ${indexDest}`)
  fs.writeFileSync(indexDest, deputeScrutinIndexJson);
}

async function createScrutinIdScrutinNameIndex(opt, indexDest) {
  const {verbose} = opt
  const scrutinIdScrutinNameIndex = await flowAsync([
    () => downloadUnzip(vote.url, [opt.dlfolder, vote.dest].join("/"), opt),
    () => [opt.dlfolder, vote.dest, `json`, `*.json`].join('/'),
    globPattern => glob(globPattern),
    map(filename => readFileSync(filename)),
    map(str => JSON.parse(str)),
    //also(x => verbose && console.log(x[0])),
    buildScrutinIdScrutinNameIndex
  ])()

  let scrutinIdScrutinNameIndexJson = JSON.stringify(scrutinIdScrutinNameIndex);
  console.log(`saving in ${indexDest}`)
  fs.writeFileSync(indexDest, scrutinIdScrutinNameIndexJson);
  return indexDest
}

async function getDeputeScrutinIndex(opt) {
  const destfile = [opt.dlfolder, "deputeScrutin.index.json"].join('/')
  if (!fs.existsSync(destfile) || opt.override) {
    await createDeputeScrutinIndex(opt, destfile)
  }
  const rawdata = fs.readFileSync(destfile);
  const deputeScrutinIndex = JSON.parse(rawdata);
  return deputeScrutinIndex
}

async function getScrutinIdScrutinNameIndex(opt) {
  const destfile = [opt.dlfolder, "scrutinIdScrutinName.index.json"].join('/')
  if (!fs.existsSync(destfile) || opt.override) {
    await createScrutinIdScrutinNameIndex(opt, destfile)
  }
  const rawdata = fs.readFileSync(destfile);
  const deputeScrutinIndex = JSON.parse(rawdata);
  return deputeScrutinIndex
}

async function fetchVoteOf(depute, opt) {
  isMissingThrow(depute, {uid: true})
  return fetchVote(depute.uid, opt)
}

async function fetchVote(uid, opt) {
  return (await getDeputeScrutinIndex(opt))[uid];
}

async function fetchOrganeActeur(uid, opt) {
  downloadUnzip(acteurEtOrgane.url, [dlfolder, acteurEtOrgane.dest].join("/"), opt)
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
    //.requiredOption('--uid <no>','')
    .parse(process.argv);
  // const anDataFetcher = await anDataFetcherBuilder(program.dlfolder, program)
  // console.log(await anDataFetcher.fetch(program.uid))
  //indexVotePerDepute(program)
  //console.log(await fetchVote("PA719930", program))
  console.log(await getScrutinIdScrutinNameIndex(program))
}

if (require.main === module) main()

module.exports = {fetchAnData: fetchOrganeActeur, fetchAnDataOf, fetchVoteOf}
