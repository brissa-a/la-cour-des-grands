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
  opt.showStep && console.log(depute)
  const stepParam = {depute, opt}
  await step(
    ["initial", "default"], stepParam,
    async () => Object.assign(depute, {uid, official_link: url})
  )
  await step(
    ["an_www_depute", "default"], stepParam,
    async () => Object.assign(depute, await fetchDepute(url, opt))
  )
  await step(
    ["an_data_depute", "default"], stepParam,
    async () => Object.assign(depute, await fetchAnDataOf(depute, opt))
  )
  await step(
    ["an_www_social", "default"], stepParam,
    async () => Object.assign(depute, await fetchSocial(url, opt))
  )
  await step(
    ["nosdeputes_link", "default"], stepParam,
    async () => depute.nosdeputes_link = `https://www.nosdeputes.fr/${depute.ident.prenom}-${depute.ident.nom}`
  )
  await step(
    ["auto_twitter", "default"], stepParam,
    async () => depute.twitter_username = await findTwitterUsernameByNameOf(depute, opt)
  )
  await step(
    ["twitter_byusername", "default"], stepParam,
    async () => depute.twitterByUsername = await fetchTwitterOfByUsername(depute, opt)
  )
  // await step(
  //   ["auto_twitter", "default"], stepParam,
  //   async () => depute.twitter = await fetchTwitterOfByUsername(depute, opt)
  // )
  await step(
    ["nd_twitter", "default"], stepParam,
    async () => depute.nd_twitter = await fetchNdTwitterOf(depute)
  )
  await step(
    ["an_www_search", "default"], stepParam,
    async () => depute.circo = await fetchSearchOf(depute, opt)
  )
  await step(
    ["an_www_pic", "default"], stepParam,
    async () => await fetchPicOf(depute, opt)
  )
  let jsonstr = JSON.stringify(depute, null, ' ');
  console.log(`saving in ${destfile}`)
  fs.writeFileSync(destfile, jsonstr);
  return depute
}

async function step(names, {opt, depute}, fct) {
  if (names.includes(opt.step)) {
    await fct()
    opt.showStep && console.log(names, depute)
  } else {
    opt.showStep && console.log(`skipping step ${names}`)
  }
}

module.exports = {getdeputeData}
