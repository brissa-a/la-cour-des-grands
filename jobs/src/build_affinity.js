const { program } = require('commander');
const deputes = require('./dl/deputes.json')
const {saveJson} = require('./fetcher/misc/files.js')

function buildAffinity(opt) {
    for (const [i, first] of deputes.entries()) {
        console.log(`${i}/${deputes.length}`)
        first.links = first.links || []
        for (const second of deputes) {
            const scrutinIds1 = Object.keys(first.scrutins)
            const scrutinIds2 = Object.keys(second.scrutins)
            const commonScrutin = scrutinIds1.filter(value => scrutinIds2.includes(value));
            const linkStrenght = commonScrutin
                .map(id => first.scrutins[id] === second.scrutins[id])
                .reduce((a,b) => a + b, 0) / commonScrutin.length
            first.links.push({
                target: second.uid,
                strenght: linkStrenght
            })
        }
    }
    const filename = [opt.dlfolder, 'withAffinity.json'].join('/')
    saveJson(filename, deputes)
}

async function main() {
    program
      .description(`Download depute data into dl/deputes.json.`)
      .option('-f, --dlfolder <folder>' , 'download folder', "dl/")
      .option('-d, --debug', 'run puppeteer headless')
      .option('--only [uid]', 'download only the one depute for debugging purpose. depute uid ex: PA722170')
      .option('-v, --verbose', 'log what\'s happening')
      .option('--no-mkdir')
      .option('--override')
      .parse(process.argv);
    buildAffinity(program);
  }
  
  if (require.main === module) main()