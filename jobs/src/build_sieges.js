const { program } = require('commander');
const layout = require("./layout.js")
const {closeBrowser} = require("./fetcher/misc/browser.js")
const fs = require('fs');

//Turn ["1-5","11-15"] into [1,2,3,4,5,11,12,13,14,15]
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

function buildSieges() {
  const sieges = []
  const interRowSpace = 1.8
  const t = this
  const rows = layout
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
        id: "ai"+curAngleIndex+ "ri"+curRadiusIndex,
        no: cursiegeno
      }
      sieges.push(siege)
    }
  })
  normalizePos(sieges)
  return sieges;
}

const {max, abs} = Math

function normalizePos(sieges) {
  const maxX = max(...sieges.map(s => abs(s.pos.x)))
  const maxY = max(...sieges.map(s => abs(s.pos.y)))
  const maxRadius = max(...sieges.map(s => s.polar.radius))
  for (const siege of sieges)  {
    siege.pos.x /= maxX
    siege.pos.y /= maxY
    siege.polar.radius /= maxRadius
  }
  return sieges;
}

async function main() {
  program.description(`generate JSON array containing all siege and their position from layout.js file`)
    .option('-f, --dlfolder <folder>' , 'download folder', "dl/")
    .option('-v, --verbose', 'log what\'s happening')
    .option('--no-mkdir')
    .option('--override')
    .parse(process.argv);
  const sieges = await buildSieges(program)
  let jsonstr = JSON.stringify(sieges, null, ' ');
  fs.writeFileSync(`${program.dlfolder}/sieges.json`, jsonstr);
  console.log(sieges)
  await closeBrowser()
}

if (require.main === module) main()

module.exports = {buildSieges}