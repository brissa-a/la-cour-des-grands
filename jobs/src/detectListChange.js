const { program } = require('commander');
const {fetchUrls} = require("./fetcher/an_www.js")
const {openOrDefault, saveJson} = require("./fetcher/misc/files.js")
const {closeBrowser} = require("./fetcher/misc/browser.js")

async function detectListChange(urlsFilepath, opt) {
    console.log("detecting list change")
    const newUrls = await fetchUrls(opt)
    const oldUrls = await openOrDefault(urlsFilepath, () => [])
    const added = newUrls.filter(n => !oldUrls.includes(n))
    const removed = oldUrls.filter(n => !newUrls.includes(n))
    if (added.length > 0 || removed.length > 0) {
        console.log("Changes detected")
        for (const add of added) {
            console.log("Added", add)
        }
        console.log("Changes detected")
        for (const remove of removed) {
            console.log("Removed", remove)
        }
        await saveJson(urlsFilepath, newUrls)
    }
}

async function main() {
    program
        .description(`Download depute data into dl/deputes.json.`)
        .option('-f, --dlfolder <folder>', 'download folder', "dl/")
        .option('-i, --dl-img', 'download depute pic')
        .option('-d, --debug', 'run puppeteer headless')
        .option('-c, --config-file <file>', 'config.json file path', 'config.json')
        .option('--only [uid]', 'download only the one depute for debugging purpose. depute uid ex: PA722170')
        .option('-v, --verbose', 'log what\'s happening')
        .option('--no-mkdir')
        .option('--override')
        .option('--step <step-name>', '', 'default')
        .option('--show-step')
        .option('--detect-list-change')
        .parse(process.argv);
    await detectListChange([program.dlfolder, `test-list.json`].join('/'), program)
    closeBrowser();
}

if (require.main === module) main()

module.exports = {detectListChange}