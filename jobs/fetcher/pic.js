const { program } = require('commander');
const fs = require('fs');
const axios = require('axios');
const {downloadFile} = require('./misc/downloader.js')
const {isMissingThrow} = require('./misc/isMissing.js')

async function fetchPicOf(depute, opt) {
  isMissingThrow(depute, {imgurl: true, uid: true})
  fetchPic(depute.uid, depute.imgurl, "dl/", opt)
  return {}
}

async function fetchPic(uid, imgurl, dlfolder, opt = {}) {
  opt.verbose && console.log(`Start download of ${imgurl}`)
  let target = `${dlfolder}/img/${uid}.png`
  return downloadFile(imgurl, target, opt)
}

//node .\fetcher\pic.js -v --nosiege "362" --imgurl "http://www2.assemblee-nationale.fr/static/tribun/15/photos/719922.jpg"
async function main() {
  program
    .description(`Download the pic of the depute`)
    .option('-v, --verbose', 'log what\'s happening')
    .option('-f, --dlfolder <folder>' , 'download folder', "dl/")
    .option('--no-mkdir')
    .option('--override')
    .requiredOption('--nosiege <no>','')
    .requiredOption('--imgurl <url>','')
    .parse(process.argv);
  await fetchPic(program.nosiege, program.imgurl, program.dlfolder, program)
}

if (require.main === module) main()

module.exports = {fetchPic, fetchPicOf}
