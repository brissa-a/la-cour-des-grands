const puppeteer = require('puppeteer');

async function main() {

  let browser = await puppeteer.launch({
      headless: false,
      args: ["--disable-setuid-sandbox"/*, "--headless"*/],
      'ignoreHTTPSErrors': true
  });
  const socialtab = await browser.newPage()
  await socialtab.goto(`http://www2.assemblee-nationale.fr/deputes/liste/reseaux-sociaux`);
  await socialtab.waitForSelector(`a[href="/deputes/fiche/OMC_PA719866"]`);
  let links = await socialtab.evaluate(() => {
    let tr = document.querySelector(`a[href="/deputes/fiche/OMC_PA719866"]`).parentNode.parentNode
    let facebook_link = tr.childNodes[3].firstChild.href
    let twitter_link = tr.childNodes[5].firstChild.href
    return {
      facebook_link: tr.childNodes[3].firstChild.href,
      twitter_link: tr.childNodes[5].firstChild.href
    }
  });
  console.log(links)
  browser.close();
}

main()
