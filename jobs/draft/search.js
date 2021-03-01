const sieges = require('../dl/sieges.json')
const Fuse = require('fuse.js')
const diacritics = require('diacritics')

const options = {
  // isCaseSensitive: false,
  ///includeScore: true,
  // shouldSort: true,
  includeMatches: true,
  ///findAllMatches: false,
  // minMatchCharLength: 1,
  // location: 0,
  ///threshold: 0.8,
  // distance: 100,
  useExtendedSearch: true,
  ignoreLocation: true,
  ///ignoreFieldNorm: true,
  getFn: function() {
    const original = Fuse.config.getFn.apply(this, arguments)
    console.log({original})
    if (Array.isArray(original)) {
      return original.map(x => diacritics.remove(x))
    } else if(original)  {
      return diacritics.remove(original)
    } else {
      return original
    }
  },
  keys: [
    "code_array","codes","codes_nested.a","lol"
    // "depute.an_data_depute.ident.nom",
    //"depute.circo.communes"
  ]
};

function wrapMatch([head, ...tail], value, wrapper, last = 0) {
  if (head && head) {
    const [start, end] = head
    const normal = value.slice(last, start)
    const match = wrapper(value.slice(start, end+1))
    const remain = wrapMatch(tail, value, wrapper,end+1)
    return  normal + match + remain
  } else {
    return value.slice(last)
  }
}

function highlightMatch({indices, key}, value) {
  return wrapMatch(indices, value, x => `<${x}>`)
}

const list = [
  {codes: "33110"},
  {codes_nested: [{a:"33110"}, {a:"13245"}, {a:"09859"}]},
  {lol: ["33110", "13245", "09853"]},
]

let fuse = new Fuse(list, options);



//let fuse2 = new Fuse(sieges, Object.assign({}, options, {keys: ""});
const resp = fuse.search("44300") //nomcomplet threshold > 0.2 match trop
const resp = fuse.search("rufin") //nomcomplet threshold > 0.2 match pas assez
const resp = fuse.search("jean luc mélenchon") //!nomcomplet match pas
const resp = fuse.search("75018") //!nomcomplet match pas
console.log(JSON.stringify(resp, null, ' '))
// respElemList = resp.slice(0, 10).map(oneresp => {
//   const matchByKey = oneresp.matches.reduce((acc,i) => {
//     acc[i.key] = i
//     return acc
//   }, {})
//   function highlightKey(key) {
//     const match = matchByKey[key]
//     const originalValue = key.split(".").reduce((acc,key) => acc[key], oneresp.item)
//     const hgl = match
//       ? highlightMatch(match, originalValue)
//       : oneresp.item.depute.an_data_depute.ident.prenom
//     return hgl
//   }
//   const hglnom = highlightKey.bind(this)("code")
//   return hglnom
//
// })
//
// for (elem of respElemList) console.log(elem)
