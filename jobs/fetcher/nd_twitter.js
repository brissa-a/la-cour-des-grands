const  _ = require('lodash');
const config = require("../config.json")
const axios = require('axios');
const {isMissingThrow} = require('./misc/isMissing.js')

const ndTwitterUrl = "https://raw.githubusercontent.com/regardscitoyens/twitter-parlementaires/master/data/deputes.json"


let cache;

function uidFromAnUrl(anUrl) {
  let pathpart = new URL(anUrl).pathname.split('/')
  let uid = pathpart[pathpart.length - 1].split('_')[1]
  return uid;
}

async function cached() {
  if (!cache) cache = init();
  return cache;
}

async function init() {
  try {
    const response = await axios.get(ndTwitterUrl);
    const data = response.data
    const groupedByUrlAn = _.groupBy(data, x=> uidFromAnUrl(x.url_an))
    return {data, groupedByUrlAn}
  } catch(e) {
    const data = {
      "error": {
        url: e.config.url,
        status: e.response.status
      }
    }
    const groupedByUrlAn = {}
    return {data, groupedByUrlAn}
  }
}

async function fetchNdTwitterOf(depute, opt) {
    isMissingThrow(depute, {uid: true})
    return await fetchNdTwitter(depute.uid)
}

async function fetchNdTwitter(uid) {
  const group = (await cached()).groupedByUrlAn[uid]
  return group && group[0]
}

async function main() {
  const uid = "PA721036"
  const response = await fetchNdTwitter(uid)
  console.log(response)
}

if (require.main === module) main()

module.exports = {fetchNdTwitterOf, fetchNdTwitter}
