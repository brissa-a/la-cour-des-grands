const { program } = require('commander');
const {buildBrowser, closeBrowser} = require('./misc/browser.js')
const {isMissingThrow} = require('./misc/isMissing.js')

let nomUrlMap;

async function fetchDatanUrlOf(depute, opt) {
    isMissingThrow(depute, {an_data_depute:{nom: true}})
    return await fetchDatanUrl(depute.an_data_depute.nom, opt)
}

async function fetchDatanUrl(nom, opt) {
  if (!nomUrlMap) {
    const {browser} = await buildBrowser(opt)
    datantab = await browser.newPage();
    await datantab.goto(`https://datan.fr/deputes`);
    await datantab.waitForSelector(".card.card-depute a")
    nomUrlMap = await datantab.evaluate(() => {
      return [...document.querySelectorAll(".card.card-depute a")]
        .map(x => ({[x.innerText]: x.href}))
        .reduce(Object.assign, {})
    });
    datantab.close()
  }
  return nomUrlMap[nom]
}

async function main() {
  program
    .description(`Download the pic of the depute`)
    .option('-v, --verbose', 'log what\'s happening')
    .option('-f, --dlfolder <folder>' , 'download folder', "dl/")
    .option('-d, --debug', 'run puppeteer headless')
    .parse(process.argv);
  console.log(await fetchDatanUrl("Jean-Luc Reitzer", program))
}

if (require.main === module) main()

module.exports = {fetchDatanUrlOf}
