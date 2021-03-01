const puppeteer = require('puppeteer');


let browser;
let socialtab;
let searchtab;

async function buildBrowser(opt) {
  if (!browser) {
    console.log("Opening the browser......");
    browser = await puppeteer.launch({
        userDataDir: opt.dlfolder+'/puppeteer',
        args: ["--disable-setuid-sandbox"],
        'ignoreHTTPSErrors': true,
        headless: !opt.debug
    });
    socialtab = await browser.newPage()
    await socialtab.goto(`http://www2.assemblee-nationale.fr/deputes/liste/reseaux-sociaux`);
    await socialtab.waitForSelector("#deputes-list")
    searchtab = await browser.newPage();
    await searchtab.goto('http://www.assemblee-nationale.fr/dyn/vos-deputes');
    await searchtab.waitForSelector(".depute-search-input")
  }
  return {browser, socialtab, searchtab}
}

async function closeBrowser() {
  browser && browser.close()
}

module.exports = {buildBrowser, closeBrowser}
