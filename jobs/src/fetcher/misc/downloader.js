const axios = require('axios');
const util = require('util');
const unzipper = require('unzipper')
const path = require('path')
const glob = require('fast-glob');
const {fileCache, openJson, saveJson} = require("./files.js")
const fs = require('fs');

const unzip = folder => unzipper.Extract({ path: folder })
const file = f => fs.createWriteStream(f)

async function download(url, output) {
  const response = await axios({
    url, method: 'GET', responseType: 'stream'
  })
  const writer = response.data.pipe(output)
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

const d = {
  mkdir: true,
  override: false,
  verbose: false
}

async function downloadFile(url, destfile, opt = {}) {
  opt = Object.assign(d, opt)
  const dir = path.dirname(destfile)
  opt.mkdir && await fs.promises.mkdir(dir, { recursive: true })
  if (!opt.redownload && fs.existsSync(destfile)) {
      opt.verbose && console.log(`${destfile} already exist, skipping download`)
      return;
  }
  opt.verbose && console.log(`Downloading file from ${url} into ${destfile}`)
  return download(url, file(destfile))
}

async  function downloadUnzip(url, destfolder, opt = {}) {
  opt = Object.assign(d, opt)
  opt.mkdir && await fs.promises.mkdir(destfolder, { recursive: true })
  if (!opt.redownload) {
    const files = await fs.promises.readdir(destfolder)
    if (files.length) {
      opt.verbose && console.log(`${destfolder} not empty, skipping download`)
      return;
    }
  }
  console.log(`Downloading zip from ${url} into ${destfolder}`)
  return download(url, unzip(destfolder))
}

async function dlJsonFile(url, destfile, opt = {}) {
  await downloadFile(url, destfile, opt)
  return openJson(destfile)
}

async function dlJsonUnzip(url, destfolder, globPattern = "**/*", opt = {}) {
  await downloadUnzip(url, destfolder, opt = {})
  return glob([destfolder, globPattern].join('/')).map(filename => ({
    filename,
    content: openJson(filename)
  }))
}

async function main() {
  downloadFile(
    url="https://www.google.com/logos/doodles/2020/december-holidays-days-2-30-6753651837108830.5-s.png",
    destfile="./google.png",
    opt={verbose: true}
  )
  downloadUnzip(
    url="http://data.assemblee-nationale.fr/static/openData/repository/15/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes_XV.json.zip",
    destfolder="test/data4.assemblee-nationale.fr/",
    opt={verbose: true}
  )
}

if (require.main === module) main()

module.exports = {downloadFile, downloadUnzip}
