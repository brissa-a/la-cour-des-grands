const config = require("../../config.json")
const { program } = require('commander');
const fs = require('fs');
const request = require('request');
const readline = require("readline");
const { isMissingThrow } = require('./misc/isMissing.js')
const { downloadFile } = require('./misc/downloader.js')

if (!config.removebg_api_key) throw new Error(`
  Missing removebg_api_key in config file config.json
  get your own api-key at https://www.remove.bg/dashboard#api-key
  and take example at config-example.json
`)

// const config = JSON.parse(fs.readFileSync(program.configFile));

async function downloadBackgroundLessPicCreateOutputFolderIfNotExistLOLSoLong(depute, opt) {
  isMissingThrow(depute, { uid: true, an_www_depute: { imgurl: true } })
  const { dlfolder } = opt
  if (fs.existsSync(dlfolder)) {
    downloadBackgroundLessPic(depute, opt);
  } else {
    console.log(`creating ${dlfolder}`)
    await fs.promises.mkdir(dlfolder, { recursive: true })
    await downloadBackgroundLessPic(depute, opt)
  }
}

async function downloadBackgroundLessPic(depute, opt) {
  const { dlfolder } = opt
  const filename = `${dlfolder}/img-nobg/${depute.uid}.png`

  if (program.overrideImg || !fs.existsSync(filename)) {
    try {
      opt.verbose && console.log(`trying download from github`)
      await downloadFromGithub(depute.uid, filename, opt)
    } catch (e) {
      if (e.response.status === 404) {
        fs.unlinkSync(filename) //remove empty file started to be created before error
        if (opt.removeBg) {
          opt.verbose && console.log(`trying download from remove.bg`)
          await downloadFromRemoveBg(depute, filename, opt)
        } else {
          console.log(`depute ${depute.uid} pic not found on github, try adding --remove-bg option to download it from paying remove.bg site`)
        }
      } else {
        console.error(`got error:${e.response.statusText} when trying to get bgless pic`)
      }
    }
  } else {
    console.log(`File ${filename} already exist. Skipping ${depute.uid}`)
  }
}

async function downloadFromGithub(uid, filename, opt = {}) {
  const imgurl = `https://raw.githubusercontent.com/brissa-a/lcdg-data/main/img-nobg/${uid}.png`
  //`https://github.com/brissa-a/la-cour-des-grands/raw/main/react-app/public/depute-pic/${uid}.png`
  opt.verbose && console.log(`Start download of ${imgurl}`)
  return downloadFile(imgurl, filename, opt)
}

async function downloadFromRemoveBg(depute, filename, opt) {
  console.log(`Downloading bgless ${depute.an_www_depute.imgurl} `)
  await new Promise((resolve, reject) => {
    request.post({
      url: 'https://api.remove.bg/v1.0/removebg',
      formData: {
        image_url: depute.an_www_depute.imgurl,
        size: 'preview',
      },
      headers: {
        'X-Api-Key': config.removebg_api_key
      },
      encoding: null
    }, function (error, response, body) {
      if (error) {
        console.error('Request failed:', error);
        reject()
        return;
      }
      if (response.statusCode != 200) {
        console.error('Error:', response.statusCode, body.toString('utf8'));
        reject()
        return;
      }
      fs.writeFileSync(filename, body);
      console.log(`Downloaded ${depute.uid}`)
      resolve();
    });
  });
}

async function mainDownloadAll() {
  program
    .description(`Download depute pic without background thanks to https://wwww.remove.bg`)
    .option('-i, --input-file <deputes file>', 'deputes.json input file path', 'dl/deputes.json')
    .option('-c, --config-file <file>', 'config.json file path', 'config.json')
    .option('-o, --output-folder <folder>', 'download folder', "dl/img-nobg/")
    .option('--override-img', 'override already download pic')
    .option('--only-one', 'download only the first depute for debugging purpose.')
  program.parse(process.argv);
  let deputes = JSON.parse(fs.readFileSync(program.inputFile));
  if (program.onlyOne) {
    deputes = [deputes[0]]
  }
  console.log(`Number of deputes: ${deputes.length}`)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question(`You are about to consume ${deputes.length * 0.25} credit are you sure ? (y/n)`, function (answer) {
    if (answer === "y") {
      for (depute of deputes) {
        downloadBackgroundLessPicCreateOutputFolderIfNotExistLOLSoLong(depute, program)
      }
    } else {
      console.log("Cancelling download bglesss")
    }
    rl.close();
  });
}

async function mainDownloadFromGithub() {
  program
  .description(`who cares`)
  .option('-f, --dlfolder <folder>' , 'download folder', "test-work/")
  .option('-d, --debug', 'run puppeteer headless')
  .option('-v, --verbose', 'log what\'s happening')
  .option('--override')
  .option('--remove-bg')
  //downloadFromGithub('PA722170', program)
  await downloadBackgroundLessPic({uid: 'PA722170'}, program)
  await downloadBackgroundLessPic({uid: 'unexisting'}, program)
}


if (require.main === module) mainDownloadFromGithub()


module.exports = { downloadBackgroundLessPicCreateOutputFolderIfNotExistLOLSoLong }