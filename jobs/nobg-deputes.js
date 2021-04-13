const { program } = require('commander');
const path = require('path')
const { dlJsonUnzip, downloadFile, exists } = require('./src/fetcher/misc/downloader.js')
const { saveJson, canAccess } = require('./src/fetcher/misc/files.js')
const config = require("./config.json")
const request = require('request');
const _ = require('lodash')
const fs = require('fs');
const imagemin = require('imagemin');
const imageminPngquant = require('imagemin-pngquant');
const imageminWebp = require('imagemin-webp');
const simpleGit = require('simple-git');
const Bottleneck = require('bottleneck');

const giturl = `https://${config.nobg_git_repo_auth ? config.nobg_git_repo_auth+"@" : ""}github.com/brissa-a/lcdg-nobg.git`

const URL = 'https://data.assemblee-nationale.fr/static/openData/repository/15/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip'

const lcdgUrl = (legislature, uid) => `https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/depute/${uid}/legislature/${legislature}-removebg.png`
const datanUrl = uid => `https://datan.fr/assets/imgs/deputes_nobg_import/depute_${uid.slice(2)}.png`
const anWwwUrl = (legislature, uid) => `http://www2.assemblee-nationale.fr/static/tribun/${legislature}/photos/${uid.slice(2)}.jpg`

async function main() {

    program
        .description(`Download depute data into dl/deputes.json.`)
        .option('-c, --config-file <file>', 'config.json file path', 'config.json')
        .option('-v, --verbose', 'log what\'s happening')
        .option('--no-mkdir')
        .option('--redownload', 'redownload all file even if already present in dlfolder')
        .option('--push-to-remote')
        .option('--no-download')
        .option('--no-optimize')
        .option('--max-concurrent <number>', 'max concurrent picture processed at time', 10)
        .option('--dl-from-remove-bg')
        .option('--work-dir <work-dir>', "Workign directory", "work")
        // .option('--clean-workdir')
        .parse(process.argv);

const lcdgNobgRepo = `${program.workDir}/nobg-git-repo`
const localFilenames = (legislature, uid) => ({
    raw: `${lcdgNobgRepo}/depute/${uid}/legislature/${legislature}-removebg.png`,
    optiPng: `${lcdgNobgRepo}/depute/${uid}/legislature/${legislature}.png`,
    optiWebp: `${lcdgNobgRepo}/depute/${uid}/legislature/${legislature}.webp`,
    latestPng: `${lcdgNobgRepo}/depute/${uid}.png`,
    latestWebp: `${lcdgNobgRepo}/depute/${uid}.webp`,
})

async function cloneRemote() {
    const gitRepoPath = lcdgNobgRepo
    console.log({ gitRepoPath: gitRepoPath })
    //clone repo if not exist
    if (!fs.existsSync(gitRepoPath)) {
        console.log(`Cloning ${giturl}`)
        const cloneResp = await simpleGit().clone(giturl, gitRepoPath)
        console.log({ cloneResp })
    } else {
        console.log("project already cloned !")
    }
    console.log("Pulling latest modification")
    const git = simpleGit(gitRepoPath, { binary: 'git' })
    await git.pull().then(x => console.log(x))
}

async function pushToRemote() {
    const gitRepoPath = lcdgNobgRepo
    const git = simpleGit(gitRepoPath, { binary: 'git' })
    console.log('Commiting... (a crime) and Pushing... (a guy off a cliff)')
    //Push modifications
    await git.add('./*').then(x => console.log(x))
    const commitHash = require('child_process').execSync('git rev-parse --short HEAD').toString().trim()
    await git.commit(`Commit by lcdg jobs:${commitHash}`, null, ['--allow-empty']).then(x => console.log(x))
    await git.push().then(x => console.log(x))
}

async function downloadFromRemoveBg(imgurl, filename) {
    const dir = path.dirname(filename)
    await fs.promises.mkdir(dir, { recursive: true })
    return new Promise((resolve, reject) => {
        request.post({
            url: 'https://api.remove.bg/v1.0/removebg',
            formData: {
                image_url: imgurl,
                size: 'preview',
            },
            headers: {
                'X-Api-Key': config.removebg_api_key
            },
            encoding: null
        }, function (error, response, body) {
            if (error) {
                console.error('Request failed:', error);
                resolve()
                return;
            }
            if (response.statusCode != 200) {
                console.error('Error:', response.statusCode, body.toString('utf8'));
                resolve()
                return;
            }
            fs.writeFileSync(filename, body);
            resolve();
        });
    });
}

async function download(legislature, uid, latest, filename, opt) {
    const isAvailableLocaly = await canAccess(filename)
    if (!isAvailableLocaly) {
        const isAnWwwAvailable = await exists(anWwwUrl(legislature, uid))
        if (isAnWwwAvailable) {
            const isAvailableOnDatan = async () => latest && ['14', '15'].includes(legislature) && await exists(datanUrl(uid))
            const isAvailableOnLcdg = async () => await exists(lcdgUrl(legislature, uid))
            if (await isAvailableOnLcdg()) {
                await downloadFile(lcdgUrl(legislature, uid), filename)
                return { isAnWwwAvailable, isAvailableLocaly, downloadFrom: "lcdg" }
            } else if (await isAvailableOnDatan()) {
                await downloadFile(datanUrl(uid), filename)
                return { isAnWwwAvailable, isAvailableLocaly, downloadFrom: "datan" }
            } else if (opt.dlFromRemoveBg) {
                debugger;
                await downloadFromRemoveBg(anWwwUrl(legislature, uid), filename)
                return { isAnWwwAvailable, isAvailableLocaly, downloadFrom: "remove.bg" }
            } else {
                return { isAnWwwAvailable, isAvailableLocaly, downloadFrom: "nowhere" }
            }
        } else {
            return { isAvailableLocaly, isAnWwwAvailable }
        }
    } else {
        return { isAvailableLocaly }
    }
}

async function optimizePng(inputfile, outputfile) {
    return optimize(inputfile, outputfile, [imageminPngquant()])
}
async function optimizeWebp(inputfile, outputfile) {
    return optimize(inputfile, outputfile, [imageminWebp()])
}

async function optimize(inputfile, outputfile, plugins) {
    const canAccessInputFile = await canAccess(inputfile)
    const canAccessOutputFile = await canAccess(outputfile)
    if (canAccessInputFile && !canAccessOutputFile) {
        const files = await imagemin([inputfile], {plugins});
        if (files.length != 1) throw new Error(`Unexpected files count ${files.length} != 1`)
        await fs.promises.writeFile(outputfile, files[0].data)
        return {canAccessInputFile, canAccessOutputFile}
    } else {
        return {canAccessInputFile, canAccessOutputFile}
    }
}

async function buildTask({ uid, legislature, latest }, opt) {
    try {
        const filenames = localFilenames(legislature, uid)
        const dlResult = opt.download && await download(legislature, uid, latest, filenames.raw, opt)
        opt.optimize && await optimizePng(filenames.raw, filenames.optiPng)
        opt.optimize && latest && await canAccess(filenames.optiPng) && await fs.promises.copyFile(filenames.optiPng, filenames.latestPng)
        opt.optimize && await optimizeWebp(filenames.raw, filenames.optiWebp)
        opt.optimize && latest && await canAccess(filenames.optiWebp) && await fs.promises.copyFile(filenames.optiWebp, filenames.latestWebp)
        opt.verbose && console.log({ uid, legislature, latest, dlResult})
        return { uid, legislature, latest, dlResult}
    } catch (error) {
        console.log({ uid, legislature, latest, error })
        return { uid, legislature, latest, error }
    }
}


    await cloneRemote()

    const contents = await dlJsonUnzip(
        url = URL,
        destfolder = `${program.workDir}/historique`,
        globPattern = "json/acteur/**/*",
        program
    )

    const todo = []
    for ({ filename, content } of contents) {
        content = await content
        //console.log({filename, content})
        const uid = path.basename(filename, path.extname(filename))
        const legislatures = _(content.acteur.mandats.mandat)
            .filter(x => x && x.typeOrgane && x.typeOrgane === 'ASSEMBLEE')
            .map(x => x.legislature)
            .uniq()
            .value();
        const latestLegislature = _.maxBy(legislatures, x => parseInt(x))
        for (const legislature of legislatures) {
            todo.push({ uid, legislature, latest: legislature === latestLegislature })
        }
    }
    const limiter = new Bottleneck({ maxConcurrent: parseInt(program.maxConcurrent) });
    const tasks = todo.map((x) => limiter.schedule(() => buildTask(x, program)));
    const all = await Promise.all(tasks)
    console.log("Remaining to download from remove.bg:" + all.filter(x => x?.dlResult?.downloadFrom && x.dlResult.downloadFrom === 'nowhere').length)
    if (program.download) {
        const review = {
            isAvailableLocaly: all.filter(x => x.dlResult.isAvailableLocaly).length,
            isNotAnWwwAvailable: all.filter(x => !x.dlResult.isAvailableLocaly && !x.dlResult.isAnWwwAvailable).length,
            downloadFrom: _.countBy(all, x => x.dlResult.downloadFrom),
        }
        console.log(review)
    }
    saveJson('work/nobg-deputes-result.json', all)
    if (program.pushToRemote) await pushToRemote()
}

if (require.main === module) main()