const path = require('path');
const fs = require('fs');
const request = require('request');
const unzip = require('unzipper')

const downloadUnzip = function(outputFolder, data_link) {
  var downloadZip = function(uri, callback){
    request.head(uri, function(err, res, body){
      if (err) throw new Error(err)
      console.log('content-type:', res.headers['content-type']);
      console.log('content-length:', res.headers['content-length']);

      request(uri).pipe(unzip.Extract({ path: outputFolder })).on('close', callback);
    });
  };

  function checkDirEmpty() {
    fs.readdir(outputFolder, function(err, files) {
        if (err) {
           console.log(err)
        } else {
          if (!files.length) {
            console.log("Downloading data from data.assemblee-nationale.fr")
            downloadZip(data_link, () => console.log("download and unzip done"))
          } else {
           console.log("Folder not empty skip downloading data from data.assemblee-nationale.fr")
          }
        }
    });
  }
  fs.promises.mkdir(outputFolder, { recursive: true })
   .catch(console.error)
   .then(() => checkDirEmpty())
}

// downloadUnzip(
//   "test/data4.assemblee-nationale.fr/",
//   "http://data.assemblee-nationale.fr/static/openData/repository/15/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes_XV.json.zip"
// )

module.exports = downloadUnzip
