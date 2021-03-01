const { program } = require('commander');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs')
const fse = require('fs-extra');

async function pushToRemote(giturl, opt) {
    const gitRepoPath = path.resolve(opt.dlfolder, 'data-git-repo')
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

    const r = (...filename) => path.resolve(opt.dlfolder, ...filename)
    console.log('Copying files to push to git repo folder')
    const copyDeputesFile = fs.promises.copyFile(r('deputes.json'), r(gitRepoPath, 'deputes.json'))
        .then(err => console.log(err || "Every thing went fine"))
    const copyScrutinsFile = fs.promises.copyFile(r('scrutins.json'), r(gitRepoPath, 'scrutins.json'))
        .then(err => console.log(err || "Every thing went fine"))
    const copyDeputesFolder = fse.copy(r('depute/'), r(gitRepoPath, 'depute/'))
        .then(copyFolderResp => console.log({ copyFolderResp }))
    const copyImgFolder = fse.copy(r('img-nobg/'), r(gitRepoPath, 'img-nobg/'))
        .then(copyFolderResp => console.log({ copyFolderResp }))
    await Promise.all([copyDeputesFile, copyDeputesFolder, copyScrutinsFile, copyImgFolder])
    console.log('Commiting... (a crime) and Pushing... (a guy off a cliff)')
    //Push modifications
    await git.add('./*').then(x => console.log(x))
    const commitHash = require('child_process').execSync('git rev-parse --short HEAD').toString().trim()
    await git.commit(`Commit by lcdg jobs:${commitHash}`, null, ['--allow-empty']).then(x => console.log(x))
    await git.push().then(x => console.log(x))
}

async function main() {
    program
        .description(`Push data files to github`)
        .option('-f, --dlfolder <folder>', 'download folder', "work/")
    try {
        await pushToRemote("https://gitlab.com/alexis.brissard/testnodegit.git", program);
    } catch (e) {
        console.log(e)
    }
}


if (require.main === module) main()

module.exports = { pushToRemote }