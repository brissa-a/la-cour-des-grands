const { program } = require('commander');
const puppeteer = require('puppeteer');
const fs = require('fs');
const request = require('request');
const downloadUnzip = require('./downloadUnzip.js')
const axios = require('axios');


program
  .description(`Download depute data into dl/deputes.json. Add -i to download img also`)
  .option('-f, --dlfolder <folder>' , 'download folder', "dl/")
  .option('-i, --dl-img', 'download depute pic')
  .option('--override-img', 'override already download pic')
  .option('-d, --debug', 'run puppeteer headless')
  .option('-c, --config-file <file>' , 'config.json file path', 'config.json')
  .option('--only-one [uid]', 'download only the one depute for debugging purpose. depute uid ex: PA722170')

program.parse(process.argv);
const downloadImg = program.dlImg
const dlFolder = program.dlfolder
const debug = program.debug

const data_link = "http://data.assemblee-nationale.fr/static/openData/repository/15/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes_XV.json.zip"
const unzipFolder = dlFolder + "/data.assemblee-nationale.fr/"
const config = JSON.parse(fs.readFileSync(program.configFile));

var download = function(uri, filename, callback){
  request.head(uri, function(err, res, body){
    console.log('content-type:', res.headers['content-type']);
    console.log('content-length:', res.headers['content-length']);

    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};

async function getdeputeUrls(browser, socialtab) {
  let url = 'http://www2.assemblee-nationale.fr/deputes/liste/alphabetique'
  let page = await browser.newPage();
  console.log(`Navigating to ${url}...`);
  await page.goto(url);
  console.log(`Waiting for #deputes-list`);
  await page.waitForSelector('#deputes-list');
  // Get the link to all the required books
  let urls = await page.$$eval('#deputes-list li > a', links => {
      links = links.map(a => a.href)
      return links;
  });
  page.close();
  return urls
}

async function getFromWWW(browser, url) {
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
  return {
    imgurl: imgurl,
    nosiege: nosiege,
    groupe: groupe,
  }
}

async function getFromData(uid) {
  let opendatapath = unzipFolder + `/json/acteur/${uid}.json`;
  if (fs.existsSync(opendatapath)) {
    let rawdata = fs.readFileSync(opendatapath);
    let opendata = JSON.parse(rawdata);
    let ident = opendata["acteur"]["etatCivil"]["ident"];
    let infoNaissance = opendata["acteur"]["etatCivil"]["infoNaissance"];
    return {
      ident: ident,
      femme: ident && (ident.civ !== "M."),
      nom: ident && `${ident.prenom} ${ident.nom}`,
      dateNais: infoNaissance && infoNaissance.dateNais
    }
  } else {
    return {}
  }
}

async function getFromTwitter(twitter_link) {
  let pathpart = new URL(twitter_link).pathname.split('/')
  let username = pathpart[pathpart.length - 2].replace('@','');
  const apiurl = `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`
  console.log("Requesting", apiurl)
  const response = await axios.get(
    apiurl,
    {'headers': {'Authorization': `Bearer ${config.twitter_bearer}`}
  });
  return response.data.data
}

async function getFromSocialWWW(browser, socialtab, url) {
  let pathpart = new URL(url).pathname
  let links = await socialtab.evaluate(pathpart => {
    let td_name = document.querySelector(`a[href="${pathpart}"]`)
    if (td_name) {
      let tr = td_name.parentNode.parentNode
      let facebook_link = tr.childNodes[3].firstChild?.href;
      let twitter_link = tr.childNodes[5].firstChild?.href;
      return {
        facebook_link: facebook_link,
        twitter_link: twitter_link,
      }
    } else {
      return {}
    }
  }, pathpart);
  return links
}

async function getFromNosdeputes(src_data) {
  return {
    nosdeputes_link: `https://www.nosdeputes.fr/${src_data.ident.prenom}-${src_data.ident.nom}`
  }
}

async function getdeputeData(browser, url, socialtab) {
  let pathpart = new URL(url).pathname.split('/')
  let uid = pathpart[pathpart.length - 1].split('_')[1]

  // data["www_an_fr"] = getFromWWW(browser, url)
  // data["data_an_fr"] = getFromData()

  let src_www = await getFromWWW(browser, url)
  let src_data = await getFromData(uid)
  let src_www_social = await getFromSocialWWW(browser, socialtab, url)
  let src_nosdepute = await getFromNosdeputes(src_data)
  let src_twitter = src_www_social?.twitter_link && await getFromTwitter(src_www_social.twitter_link)

  let data = {
    uid: uid, official_link: url,
    ...src_www,
    ...src_data,
    ...src_www_social,
    ...src_nosdepute,
    twitter: src_twitter
  }

  if (downloadImg) {
    console.log(`Start download of ${data.imgurl}`)
    let target = `${dlFolder}/img/${data.nosiege}.png`
    if (program.overrideImg || !fs.existsSync(target)) {
      download(data.imgurl, target, function(){
        console.log(`Download of ${data.imgurl} done`);
      });
    } else {
      console.log(`Skipping. ${target} already exist`)
    }
  }
  return data
}

async function main() {
  const start = Date.now();
  try {
      console.log("Opening the browser......");
      browser = await puppeteer.launch({
          headless: false,
          args: ["--disable-setuid-sandbox"],
          'ignoreHTTPSErrors': true,
          headless: !debug
      });
      const socialtab = await browser.newPage()
      await socialtab.goto(`http://www2.assemblee-nationale.fr/deputes/liste/reseaux-sociaux`);
      await socialtab.waitForSelector("#deputes-list")
      downloadUnzip(unzipFolder, data_link)
      urls = await getdeputeUrls(browser)
      console.log(urls);
      datum = []
      i = 0
      if (program.onlyOne === true) {
        urls=[urls[0]]
      } else if(program.onlyOne) {
        urls=[`http://www2.assemblee-nationale.fr/deputes/fiche/OMC_${program.onlyOne}`]
      }
      // TODO download slice
      // const slice_size = 15;
      // int i = 0
      for (url of urls) {
        console.log(`${i++}/${urls.length}`)
        data = await getdeputeData(browser, url,socialtab)
        console.log(data)
        datum.push(data)
      }
      //Save file
      let jsonstr = JSON.stringify(datum, null, ' ');
      fs.writeFileSync(`${dlFolder}/deputes.json`, jsonstr);
      browser.close()
  } catch (err) {
      console.log("Could not create a browser instance => : ", err);
  }
  const millis = Date.now() - start;
  console.log(`seconds elapsed = ${Math.floor(millis / 1000)}`);
}

main()
