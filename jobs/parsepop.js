const fs = require('fs');
let filecontent = fs.readFileSync("population francais par age - Feuille 1.csv").toString();

Object.prototype.let = function(f) {return f(this)}

let rows = filecontent.split("\n")
  .map(rowStr => rowStr.split(','))
  .slice(1) //remove header don't care go to trash you useless cunt
  .map(splitted => ({
    age: splitted[1].let(Number.parseInt),
    nombre: splitted[4].trim().replaceAll(' ', '').let(Number.parseInt)
  }))
fs.writeFileSync("population francais par age - Feuille 1.json", JSON.stringify(rows));
