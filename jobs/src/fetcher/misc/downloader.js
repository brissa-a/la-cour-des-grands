const axios = require('axios');
const util = require('util');
const unzipper = require('unzipper')
const path = require('path')
const glob = require('fast-glob');
const { fileCache, openJson, saveJson } = require("./files.js")
const fs = require('fs');

const unzip = folder => unzipper.Extract({ path: folder })
const file = f => fs.createWriteStream(f)

async function exists(url) {
  try {
    await axios.head(url);
    return true;
  } catch (error) {
    if (error.response && error.response.status >= 400) {
      return false;
    } else {
      throw error
    }
  }
}

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
  redownload: false,
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

async function downloadUnzip(url, destfolder, opt = {}) {
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
  await downloadUnzip(url, destfolder, opt)
  const filenames = await glob([destfolder, globPattern].join('/'))
  function* contentIterator() {
    for (filename of filenames) {
      yield { filename, content: openJson(filename) }
    }
  }
  return {filenames, [Symbol.iterator]: contentIterator}
}

async function main() {
  await download('https://datan.fr/assets/imgs/deputes_nobg_import/depute_60.png', "download.test");
}

if (require.main === module) main()

module.exports = { downloadFile, downloadUnzip, dlJsonFile, dlJsonUnzip, exists }
