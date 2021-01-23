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
const {fetchNdTwitterOf} = require("./fetcher/nd_twitter.js")
const {fetchPicOf} = require("./fetcher/pic.js")
const path = require('path')

const {fetchDepute, fetchSocial, fetchSearchOf} = require("./fetcher/an_www.js")
const {fetchAnDataOf} = require("./fetcher/an_data.js")
const {fetchDatanUrlOf} = require("./fetcher/datan.js")

async function getdeputeData(url,  opt) {
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
    async () => ({uid, official_link: url})
  )
  depute = await step(
    ["an_www_depute", "default"], depute, opt,
    async () => await fetchDepute(url, opt)
  )
  depute = await step(
    ["an_data_depute", "default"], depute, opt,
    async () => await fetchAnDataOf(depute, opt)
  )
  depute = await step(
    ["an_www_social", "default"], depute, opt,
    async () => await fetchSocial(url, opt)
  )
  depute = await step(
    ["nosdeputes_link", "default"], depute, opt,
    async () => ({nosdeputes_link: `https://www.nosdeputes.fr/${depute.ident.prenom}-${depute.ident.nom}`})
  )
  depute = await step(
    ["find_twitter_username", "default"], depute, opt,
    async () => findTwitterUsernameByNameOf(depute, opt),
    "twitter_username"
  )
  depute = await step(
    ["twitter_byusername", "default"], depute, opt,
    async () => fetchTwitterOfByUsername(depute, opt),
    "twitter_username"
  )
  depute = await step(
    ["nd_twitter", "default"], depute, opt,
    async () => fetchNdTwitterOf(depute, opt),
    "nd_twitter"
  )
  depute = await step(
    ["an_www_search", "default"], depute, opt,
    async () => fetchSearchOf(depute, opt),
    "circo"
  )
  depute = await step(
    ["an_www_pic", "default"], depute, opt,
    async () => fetchPicOf(depute, opt)
  )
  depute = await step(
    ["datan", "default"], depute, opt,
    async () => fetchDatanUrlOf(depute, opt),
    "datan"
  )
  let jsonstr = JSON.stringify(depute, null, ' ');
  console.log(`saving in ${destfile}`)
  fs.writeFileSync(destfile, jsonstr);
  return depute
}

async function step(names, depute,  opt, fct, scopename) {
  if (names.includes(opt.step)) {
    let update;
    try {
      if (!scopename) {
        console.log(`Fetching root update`)
        update = await fct()
      } else if (opt.override) {
        console.log(`Overriding ${scopename} data`)
        let data = await fct()
        update = data ? {[scopename]: data} : {}
      } else if (!depute[scopename]) {
        console.log(`Fetching ${scopename} data`)
        let data = await fct()
        update = data ? {[scopename]: data} : {}
      } else {
        console.log(`${scopename} already present skipping update`)
        update = {}
      }
    } catch (e) {
      console.log(e)
      if (e.missingFields) {
        e.missingFields.forEach(missingField => console.log(`depute${missingField} is missing`))
      }
      console.log(`Caught exception for ${fct.name} skipping update...` )
      update = {}
    }
    opt.showStep && console.log(names, {update})
    return Object.assign({}, depute, update)
  } else {
    opt.showStep && console.log(`skipping step ${names}`)
    return depute
  }
}

module.exports = {getdeputeData}
