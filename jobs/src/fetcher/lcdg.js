const { program } = require('commander');
const { buildSieges } = require('../build_sieges.js')
const { fileCache, openJson, saveJson, openOrDefault } = require('./misc/files.js')
const _ = require('lodash')
const {isMissingThrow} = require('./misc/isMissing.js')

async function getSiegePerNo(opt) {//How to invalidate cache ?
    const siegesByNoFilename = [opt.dlfolder, 'siegesByNo.json'].join('/')
    const siegesFilename = [opt.dlfolder, 'sieges.json'].join('/')
    const sieges = await fileCache(siegesFilename, () => buildSieges())
    return fileCache(siegesByNoFilename, () => _.groupBy(sieges, siege => siege.no))
}

async function getLcdgOf(depute, opt) {
    isMissingThrow(depute, {an_www_depute: {nosiege: true}})
    return getLcdg(depute.an_www_depute.nosiege, opt)
}

async function getLcdg(nosiege, opt) {
    return {siege: (await getSiegePerNo(opt))[nosiege][0]}
}

async function main() {
    program
        .description(`who cares`)
        .option('-v, --verbose', 'log what\'s happening')
        .option('-f, --dlfolder <folder>', 'download folder', "dl/")
        .option('--no-mkdir')
        .option('--override')
        .parse(process.argv);
    console.log(await getLcdg("63", program))
}

if (require.main === module) main()

module.exports = {getLcdgOf}