const { program } = require('commander');
const layout = require("./layout.js")
const {getDeputesData} =  require("./dl_deputes.js")
const {closeBrowser} = require("./fetcher/misc/browser.js")
const fs = require('fs');

//Turn ["1-5","11-15"] to [1,2,3,4,5,11,12,13,14,15]
function unpackrow(row) {
  return row.flatMap(bloc => {
    const startend = bloc.split('-')
    const start = Number.parseInt(startend[0])
    const end = Number.parseInt(startend[1])
    const size = end - start + 1
    const unpacked = [...Array(size).keys()].map(i => i + start)
    return unpacked
  })
}

function deputeWithSiege(deputes) {
  const sieges = []
  const interRowSpace = 1.8
  const t = this
  const rows = layout
  const bySiegeno = {}
  for (const depute of deputes) {
    bySiegeno[depute.nosiege]=depute
  }
  const unpackedrows = rows.map(unpackrow)
  unpackedrows.forEach(function (row, curRadiusIndex) {
    const siegePerRow = row.length
    const angleStep = Math.PI / (siegePerRow - 1)
    for (let curAngleIndex = 0; curAngleIndex < siegePerRow; curAngleIndex++) {
      const cursiegeno = row[curAngleIndex]
      const polar = {
        radius: (curRadiusIndex + 5) * interRowSpace,
        angle: curAngleIndex * angleStep
      }
      const siege = {
        pos: {
          x: Math.cos(polar.angle) * polar.radius,
          y: -Math.sin(polar.angle) * polar.radius
        },
        polar,
        curAngleIndex,curRadiusIndex,
        depute: bySiegeno[cursiegeno],
        siegeid: "ai"+curAngleIndex+ "ri"+curRadiusIndex,
        siegeno: cursiegeno
      }
      sieges.push(siege)
    }
  })
  return sieges;
}

async function main() {
  program
    .description(`Download depute data into dl/deputes.json. Add -i to download img also`)
    .option('-f, --dlfolder <folder>' , 'download folder', "dl/")
    .option('-i, --dl-img', 'download depute pic')
    .option('-d, --debug', 'run puppeteer headless')
    .option('-c, --config-file <file>' , 'config.json file path', 'config.json')
    .option('--only [uid]', 'download only the one depute for debugging purpose. depute uid ex: PA722170')
    .option('-v, --verbose', 'log what\'s happening')
    .option('--no-mkdir')
    .option('--override')
    .option('--step <step-name>', '', 'default')
    .option('--show-step')
    .parse(process.argv);
  const deputes = await getDeputesData(program)
  const sieges = await deputeWithSiege(deputes, program)
  let jsonstr = JSON.stringify(sieges, null, ' ');
  fs.writeFileSync(`${program.dlfolder}/sieges.json`, jsonstr);
  console.log(sieges)
  await closeBrowser()
}

if (require.main === module) main()
