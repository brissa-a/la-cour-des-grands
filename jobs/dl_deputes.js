const { program } = require('commander');
const puppeteer = require('puppeteer');
const fs = require('fs');
const Bottleneck = require('bottleneck');
const {getdeputeData} = require('./src/dl_depute.js')
const {closeBrowser} = require("./src/fetcher/misc/browser.js")
const glob = require('fast-glob');
const {fileCache, openJson, saveJson} = require("./src/fetcher/misc/files.js")
const {diffArrays} = require('diff')
const {detectListChange} = require('./src/detectListChange.js')
const {pushToRemote} = require("./src/pushToRemote.js")
const {getScrutinIdScrutinNameIndex} = require('./src/fetcher/an_data.js')

async function getDeputesData(opt) {
  var datum;
  if (opt.cleanWorkdir) {
    console.log("Cleaning work directory")
    await fs.promises.rmdir(opt.dlfolder, { recursive: true }).then(() => console.log('directory removed!'));
  }
  const urlsFilepath = [opt.dlfolder, 'depute_urls.json'].join('/')
  try {
      var urls;
      if (opt.detectListChange) await detectListChange(urlsFilepath, opt)
      if (opt.only === true) {
        urls=[`http://www2.assemblee-nationale.fr/deputes/fiche/OMC_PA605036`]
      } else if(opt.only) {
        urls = opt.only.split(";").map(uid => `http://www2.assemblee-nationale.fr/deputes/fiche/OMC_${uid}`)
      } else {
        urls = await openJson(urlsFilepath)
      }
      console.log(`Found ${urls.length} urls`, urls.slice(0, 10));
      const limiter = new Bottleneck({ maxConcurrent: 1 });
      var i= 0
      async function counted(url) {
        const data = await getdeputeData(url, opt)
        opt.verbose && console.log(`${++i}/${urls.length}`)
        //opt.verbose && console.log(data)
        return data
      }
      const tasks = urls.map((url) => limiter.schedule(() => counted(url)));
      await Promise.all(tasks)
      datum = (await glob(`./${opt.dlfolder}/depute/*.json`))
        .map(filename => fs.readFileSync(filename))
        .map(str =>  JSON.parse(str))
      
      console.log(`saving ./${opt.dlfolder}/depute/*.json in ${opt.dlfolder}/deputes.json`)
      await saveJson(`${opt.dlfolder}/deputes.json`, datum, false)
      await getScrutinIdScrutinNameIndex(opt)
      if (opt.pushToRemote) {
        await pushToRemote(opt.pushToRemote, opt)
      }
  } catch (err) {
      console.log("Error while fetching deputes", err);
  }
  return datum
}

async function main() {
  program
    .description(`Download depute data into dl/deputes.json.`)
    .option('-f, --dlfolder <folder>' , 'work folder', "work/")
    .option('-d, --debug', 'run puppeteer headless')
    .option('-c, --config-file <file>' , 'config.json file path', 'config.json')
    .option('--only [uid]', 'download only the one depute for debugging purpose. depute uid ex: PA722170')
    .option('-v, --verbose', 'log what\'s happening')
    .option('--no-mkdir')
    .option('--override', 'rewrite data from all steps even if already present')
    .option('--redownload', 'redownload all file even if already present in dlfolder')
    .option('--step <step-name>', '', 'default')
    .option('--show-step')
    .option('--no-detect-list-change', 'detect added/removed deputes')
    .option('--push-to-remote <giturl>')
    .option('--clean-workdir')
    .parse(process.argv);
  const start = Date.now();
  await getDeputesData(program)
  await closeBrowser()
  const millis = Date.now() - start;
  console.log(`seconds elapsed = ${Math.floor(millis / 1000)}`);
}

if (require.main === module) main()

module.exports = {getDeputesData}
