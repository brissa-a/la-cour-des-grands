const { program } = require('commander');
const {buildBrowser, closeBrowser} = require('./misc/browser.js');
const { dlJsonFile } = require('./misc/downloader.js');
const {isMissingThrow} = require('./misc/isMissing.js')

const url = 'http://www2.assemblee-nationale.fr/deputes/liste/alphabetique'

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSearchOf(depute, opt) {
    isMissingThrow(depute, {uid: true})
    return await fetchSearch(depute.uid, opt)
}


/*
{
    acteurId: 'OMC_PA2150',
    civ: 'M.',
    nom: 'Mélenchon',
    prenom: 'Jean-Luc',
    group: 'La France insoumise',
    departement: 'Bouches-du-rhône',
    numDepartement: '13',
    numCirco: '4',
    communes: 'Marseille 1er arrondissement (13001),Marseille 5eme arrondissement (13005),Marseille,Marseille 2eme arrondissement (13002),Marseille 3eme arrondissement (13003),Marseille 6eme arrondissement (13006)'
  }
*/
let searchData;
async function fetchSearch(uid, opt) {
  const v = opt.verbose;
  let target = `${opt.dlfolder}/an_www/get-deputes-data.json`
  while (!searchData) {
    searchData = (await dlJsonFile('https://www.assemblee-nationale.fr/dyn/ajax/deputes/get-deputes-data', target, opt)).data
    for (one of searchData) {
      one.communes = one.communes.split(',').map(commune => commune.trim()).sort();
    }
    //searchData && v && console.log({searchData})
  }
  [head, ...tail] = searchData.filter(searchResp => searchResp.acteurId === `OMC_${uid}`)
  return head
}

async function fetchUrls(opt) {
  const {browser} = await buildBrowser(opt);
  const v = opt.verbose;
  let page = await browser.newPage();
  v && console.log(`Navigating to ${url}...`);
  await page.goto(url);
  v && console.log(`Waiting for #deputes-list`);
  await page.waitForSelector('#deputes-list');
  let urls = await page.$$eval('#deputes-list li > a', links => {
      links = links.map(a => a.href)
      return links;
  });
  page.close();
  return urls
}

async function fetchDepute(url, opt) {
  var {browser} = await buildBrowser(opt)
  let page = await browser.newPage()
  console.log(`Opening  to ${url}...`);
  await page.goto(url);
  await page.waitForSelector('#deputes-illustration');
  let imgurl = await page.$$eval('#deputes-illustration > .deputes-image > img', imgs => {
      return imgs[0].src;
  });
  let nosiege = await page.$$eval(`#hemicycle > text`, nos => {
      return nos[0].textContent
  });
  let groupe = await page.$$eval(`#deputes-illustration > span > a`, nos => {
      return nos[0].textContent.trim()
  });
  page.close()
  return {imgurl,nosiege,groupe}
}

async function fetchSocial(url, opt) {
  var {browser, socialtab} = await buildBrowser(opt)
  let pathpart = new URL(url).pathname
  let links = await socialtab.evaluate(pathpart => {
    let td_name = document.querySelector(`a[href="${pathpart}"]`)
    if (td_name) {
      let tr = td_name.parentNode.parentNode
      let facebook_link = tr.childNodes[3].firstChild?.href;
      let twitter_link = tr.childNodes[5].firstChild?.href;
      return {facebook_link,twitter_link}
    } else {
      return {}
    }
  }, pathpart);
  return links
}

async function main() {
  program
    .description(`fetch data from www.assemblee-nationale.fr`)
    .option('-f, --dlfolder <folder>' , 'download folder', "dl/")
    .option('-d, --debug', 'run puppeteer headless')
    .option('-c, --config-file <file>' , 'config.json file path', 'config.json')
    .requiredOption('--uid [uid]', 'uid of the depute')
    .option('-v, --verbose', 'log what\'s happening')
    .option('--no-mkdir')
    .option('--override')
    .parse(process.argv);
  console.log(await fetchSearch(program.uid, program))
  await closeBrowser()
}

if (require.main === module) main()

module.exports = {fetchUrls, fetchDepute, fetchSocial, fetchSearchOf}
