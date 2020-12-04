const { program } = require('commander');
const fs = require('fs');
const request = require('request');
const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

program
  .description(`Download depute pic without background thanks to https://wwww.remove.bg`)
  .option('-i, --input-file <deputes file>' , 'deputes.json input file path', 'dl/deputes.json')
  .option('-c, --config-file <file>' , 'config.json file path', 'config.json')
  .option('-o, --output-folder <folder>' , 'download folder', "dl/img/nobg/")
  .option('--override-img', 'override already download pic')
  .option('--only-one', 'download only the first depute for debugging purpose.')
program.parse(process.argv);

if (!fs.existsSync(program.configFile)) throw new Error(`
  Missing config file ${program.configFile}
  get your own api-key at https://www.remove.bg/dashboard#api-key
  and take example at config-example.json
`)

const config = JSON.parse(fs.readFileSync(program.configFile));

async function downloadBackgroundLessPicCreateOutputFolderIfNotExistLOLSoLong(depute) {
  if (fs.existsSync(program.outputFolder)) {
    downloadBackgroundLessPic(depute);
  } else {
    console.log(`creating ${program.outputFolder}`)
    await fs.promises.mkdir(program.outputFolder, { recursive: true })
      .catch(console.error)
      .then(() => downloadBackgroundLessPic(depute))
  }
}

async function downloadBackgroundLessPic(depute) {
  const filename = `${program.outputFolder}/${depute.nosiege}.png`

  if (program.overrideImg || !fs.existsSync(filename)) {
    console.log(`Downloading bgless ${depute.imgurl} `)
    request.post({
      url: 'https://api.remove.bg/v1.0/removebg',
      formData: {
        image_url: depute.imgurl,
        size: 'preview',
      },
      headers: {
        'X-Api-Key': config.removebg_api_key
      },
      encoding: null
    }, function(error, response, body) {
      if(error) return console.error('Request failed:', error);
      if(response.statusCode != 200) return console.error('Error:', response.statusCode, body.toString('utf8'));
      fs.writeFileSync(filename, body);
      console.log(`Downloaded ${depute.nosiege}`)
    });
  } else {
    console.log(`File ${filename} already exist. Skipping ${depute.nosiege}`)
  }
}

async function main() {
    let deputes = JSON.parse(fs.readFileSync(program.inputFile));
    if (program.onlyOne) {
      deputes = [deputes[0]]
    }
    console.log(`Number of deputes: ${deputes.length}`)
    rl.question(`You are about to consume ${deputes.length * 0.25} credit are you sure ? (y/n)`, function(answer) {
      if (answer === "y") {
        for (depute of deputes) {
          downloadBackgroundLessPicCreateOutputFolderIfNotExistLOLSoLong(depute)
        }
      } else {
        console.log("Cancelling download bglesss")
      }
      rl.close();
    });
}



main()
