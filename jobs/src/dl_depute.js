const { program } = require('commander');
const fs = require('fs');
const {
  findTwitterUsernameByNameOf,
  findTwitterUsernameByName,
  fetchTwitterOfByLink,
  fetchTwitterOfByUsername,
  fetchTwitterByLink,
  fetchTwitterByUsername
} = require("./fetcher/twitter.js")
const { fetchNdTwitterOf } = require("./fetcher/nd_twitter.js")
const { fetchPicOf } = require("./fetcher/pic.js")
const path = require('path')

const { getLcdgOf } = require('./fetcher/lcdg.js')
const { fetchDepute, fetchSocial, fetchSearchOf } = require("./fetcher/an_www.js")
const { fetchAnDataOf, fetchVoteOf } = require("./fetcher/an_data.js")
const { fetchDatanUrlOf } = require("./fetcher/datan.js")
const { downloadBackgroundLessPicCreateOutputFolderIfNotExistLOLSoLong } = require("./fetcher/nobg.js");
const { saveJson } = require('./fetcher/misc/files.js');

async function getdeputeData(url, opt) {
  opt.showStep && console.log(url)
  let pathpart = new URL(url).pathname.split('/')
  let uid = pathpart[pathpart.length - 1].split('_')[1]
  const destfile = `${opt.dlfolder}/depute/${uid}.json`;
  const dir = path.dirname(destfile)
  opt.mkdir && await fs.promises.mkdir(dir, { recursive: true })
  let depute;
  if (fs.existsSync(destfile)) {
    opt.verbose && console.log(`${destfile} already exist, loading`)
    let str = fs.readFileSync(destfile);
    depute = JSON.parse(str);
  }
  depute = depute || {}
  depute = await step(
    ["initial", "default"], depute, opt,
    async () => url,
    "official_link"
  )
  depute = await step(
    ["initial", "default"], depute, opt,
    async () => uid,
    "uid"
  )
  depute = await step(
    ["an_www_depute", "default"], depute, opt,
    async () => await fetchDepute(url, opt),
    "an_www_depute"
  )
  depute = await step(
    ["an_data_depute", "default"], depute, opt,
    async () => await fetchAnDataOf(depute, opt),//uid
    "an_data_depute"
  )
  depute = await step(
    ["an_www_social", "default"], depute, opt,
    async () => await fetchSocial(url, opt),
    "an_www_social"
  )
  depute = await step(
    ["nosdeputes_link", "default"], depute, opt,
    async () => `https://www.nosdeputes.fr/${depute.an_data_depute.ident.prenom}-${depute.an_data_depute.ident.nom}`,
    "nosdeputes_link"
  )
  depute = await step(
    ["find_twitter_username", "default"], depute, opt,
    async () => findTwitterUsernameByNameOf(depute, opt),//nom
    "twitter_username"
  )
  depute = await step(
    ["twitter_byusername", "default"], depute, opt,
    async () => fetchTwitterOfByUsername(depute, opt),//twitter_username
    "twitter"
  )
  depute = await step(
    ["nd_twitter", "default"], depute, opt,
    async () => fetchNdTwitterOf(depute, opt),//uid
    "nd_twitter"
  )
  depute = await step(
    ["lcdg", "default"], depute, opt,
    async () => getLcdgOf(depute, opt),//uid
    "lcdg"
  )
  depute = await step(
    ["an_www_search", "default"], depute, opt,
    async () => fetchSearchOf(depute, opt),//uid
    "circo"
  )
  depute = await step(
    ["an_www_pic", "default"], depute, opt,
    async () => fetchPicOf(depute, opt),//imgurl uid
    "an_www_pic"
  )
  depute = await step(
    ["nobg", "default"], depute, opt,
    async () => downloadBackgroundLessPicCreateOutputFolderIfNotExistLOLSoLong(depute, opt),//uid
    "nobg"
  )
  depute = await step(
    ["datan", "default"], depute, opt,
    async () => fetchDatanUrlOf(depute, opt),//nom
    "datan"
  )
  depute = await step(
    ["scrutins", "default"], depute, opt,
    async () => fetchVoteOf(depute, opt),//uid
    "scrutins"
  )
  console.log(`saving in ${destfile}`)
  saveJson(destfile, depute, true);
  return depute
}

async function step(names, depute, opt, fct, scopename) {
  if (names.includes(opt.step)) {
    let update;
    try {
      if (!scopename) {
        throw new Error("missing scopename")
        // console.log(`Fetching root update`)
        // update = await fct()
      } else if (opt.override) {
        console.log(`Overriding ${scopename} data`)
        let data = await fct()
        update = data ? { [scopename]: data } : {}
      } else if (!depute[scopename]) {
        console.log(`Fetching ${scopename} data`)
        let data = await fct()
        update = data ? { [scopename]: data } : {}
      } else {
        console.log(`${scopename} already present skipping update`)
        update = {}
      }
    } catch (e) {
      console.log(e)
      if (e.missingFields) {
        e.missingFields.forEach(missingField => console.log(`depute${missingField} is missing`))
      }
      console.log(`Caught exception for ${fct.name} skipping update...`)
      update = {}
    }
    opt.showStep && console.log(names, { update })
    return Object.assign({}, depute, update)
  } else {
    opt.showStep && console.log(`skipping step ${names}`)
    return depute
  }
}

module.exports = { getdeputeData }
