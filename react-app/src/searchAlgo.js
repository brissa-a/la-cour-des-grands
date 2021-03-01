// const diacritics = require('diacritics')
// const {groupBy, sortBy, minBy, result, maxBy} = require('lodash')

import diacritics from 'diacritics'
import { groupBy, sortBy } from 'lodash'
const {max, min} = Math

const createNode = () => ({children: {}, key: null, prevSearch: {}})

export function buildIndex(deputes, scrutins) {
    const wordTree = createNode()
    const wordToTokens = {}
    const deputeTokens = deputes.flatMap(tokenizeDepute)
    const scrutinTokens = Object.entries(scrutins).flatMap(tokenizeScrutin)
    const allTokens = deputeTokens.concat(scrutinTokens)
    //console.log({dictSize: allTokens.length})
    for (const token of allTokens) {
        insert(wordTree, token.word)
        const tokens = wordToTokens[token.word] || [];
        tokens.push(token)
        wordToTokens[token.word] = tokens
    }
    return {wordTree, wordToTokens}
}

function tokenizeScrutin([id, titre]) {
    const allTokens = []
    allTokens.push(tokenize(
        titre,
        "vote:"+id,
        {getField: x => x.titre, fieldName: `titre`, item: {id, titre}, weight: 0.9}
    ))
    return allTokens.flatMap(x => x)
}

function tokenizeDepute(depute) {
    const ref = "depute:"+depute.uid
    let allTokens = []
    allTokens.push(tokenize(
        depute.an_data_depute.nom,
        ref,
        {getField: x => x.an_data_depute.nom, fieldName: `an_data_depute.nom`, item: depute, weight: 1.10}
    ))
    allTokens.push(tokenize(
        depute.circo.departement,
        ref,
        {getField: x => x.circo.departement, fieldName: `circo.departement`, item: depute, weight: 1.05}
    ))
    allTokens.push(tokenize(
        depute.circo.numDepartement,
        ref,
        {getField: x => x.circo.numDepartement, fieldName: `circo.numDepartement`, item: depute, weight: 1.05}
    ))
    allTokens.push(tokenize(
        depute.circo.numCirco,
        ref,
        {getField: x => x.circo.numCirco, fieldName: `circo.numCirco`, item: depute, weight: 1.05}
    ))
    for (const [idx, commune] of depute.circo.communes.entries()) {
        const communeTokens = tokenize(
        commune,
        ref,
        {getField: x => x.circo.communes[idx], fieldName: `circo.communes`, item: depute, arrayKey: idx}
        )
        allTokens.push(communeTokens)
    }
    return allTokens.flatMap(x => x)
}

function normalizeTxt(txt) {
    return  diacritics.remove(txt.toLowerCase())
}

function tokenize(txt, ref, meta) {
    // eslint-disable-next-line no-useless-escape
    let words = normalizeTxt(txt).split(/[()\[\]<>\s-,']/)
    let i = 0
    let withPos = []
    for (const word of words) {
        withPos.push({
            word,
            slice: [i, i+word.length]
        });
        i+= (word.length + 1) //Skip delimiter
    }
    return withPos
        .filter(x => x.word)
        .map(x =>Object.assign({ref}, meta, x))
}
  
  
export function search(index, query) {
    const {wordTree, wordToTokens} = index
    // eslint-disable-next-line no-useless-escape
    const terms = normalizeTxt(query).split(/[()\[\]<>\s-,']/).filter(x => x)
    const allTermResults = []
    for (const term of terms) {
        const results = searchWord(wordTree, term)
        const foundTokens = []
        for (const [word, dist] of Object.entries(results)) {
            const tokensWithRes = wordToTokens[word].map(token => ({token, result: {word, dist}}))
            foundTokens.push(...tokensWithRes)
        }
        const tokensPerRef = groupBy(foundTokens, found => found.token.ref);
        const scoredResults = Object.entries(tokensPerRef).map(([ref, founds]) => {
            const score = founds.map(({token,result}) => {
                // eslint-disable-next-line no-unused-vars
                const [editstack, dist] = result.dist
                const weight = token.weight || 1
                return (query.length - dist)/query.length * weight
            }).reduce((a,b) => max(a,b))
            return {ref, item: founds[0].token.item, metadata: founds, score: score}
        });
        allTermResults.push(...scoredResults)
    }
    const mergedScore = Object.values(groupBy(allTermResults, x=>x.ref)).map(sameRefResult =>{
        return sameRefResult.reduce((a,b) => {
            return {ref: a.ref, item: a.item, metadata: a.metadata.concat(b.metadata), score: a.score + b.score}
        })
    })
    return sortBy(mergedScore,  x => x.score).reverse()
}

function insert(node, word) {
    insertChar(node, word, 0)
    function insertChar(node, word, i) {
        if (i < word.length) {
            const c = word[i]
            const child = getOrCreateChild(node, c)
            insertChar(child, word, i+1)
        } else {
            node.key = word
        }
    }
}

function getOrCreateChild(node, childname) {
    let child = node.children[childname]
    if (!child) {
        child = createNode()
        node.children[childname] = child
    }
    return child
}

//let i, j;

function searchWord(tree, word, log) {
    const results = {}
    // i = 0
    // j = 0
    searchNode(tree, word, 0, min(3, Math.round(word.length/2)), [], results)
    log && logResultColored(results)
    //console.log({i, j})
    return results
}

function searchNode(node, word, cur_dist, max_dist, editStack, results) {
    //i++
    if (node.key) {
        // eslint-disable-next-line no-unused-vars
        const [prevEditStack,d] = results[node.key] || [[], Number.MAX_VALUE]
        if (d > (cur_dist + word.length) && (cur_dist + word.length) < max_dist) {
            results[node.key] = [[...editStack], cur_dist + word.length]
        }
    }
    // if (node.prevSearch[word] && node.prevSearch[word][0] > cur_dist) {
    //     j++
    // }
    if (cur_dist > max_dist) {
        //Stop browsing tree
    } else if (!word.length) {
        //Remains
        //Browse only as deletion
        //Deletion after query lenght worth less so we return "start with"
        //If !word.lengt && !node.children it stop browsing here
        editStack.push("r")
        for (const child of Object.values(node.children)) {
            searchNode(child, word, cur_dist + 0.01, max_dist, editStack, results) // rec(i+1, j)
        }
        editStack.pop()
    } else {
        const [head, ...tail] = word
        //Levenshtein like
        for (const [childname, child] of Object.entries(node.children)) { 
            if (childname === head) {               
                editStack.push('e')//Equality
                searchNode(child, tail, cur_dist + 0, max_dist, editStack, results) // rec(i+1, j+1)
                editStack.pop()
            } else {
                editStack.push('s')//Substitution
                searchNode(child, tail, cur_dist + 1, max_dist, editStack, results)
                editStack.pop()
            }
            editStack.push("d")//Deletion
            searchNode(child, word, cur_dist + 1, max_dist, editStack, results) // rec(i+1, j)
            editStack.pop()
        }
        //Addition
        editStack.push("a")
        searchNode(node, tail, cur_dist + 1, max_dist, editStack,results)// rec(i, j+1)
        editStack.pop()
    }
}

//const reset = "\x1B[0m"
const colors = {
    'd': "\x1B[91m",
    'a': "\x1B[91m",
    'e': "\x1B[39m",
    's': "\x1B[93m",
    'r': "\x1B[90m",
}
function color(str, editstack) {
    const [edit, ...remainEdit] = editstack
    const [char, ...remainChar] = str
    if (!edit) return ""
    else if (edit === 'a') return  colors[edit]+'_'+color(str, remainEdit)
    else return colors[edit]+char+color(remainChar, remainEdit)
}

function logResultColored(results) {
    const coloredResult = Object.entries(results).map(([str, [editstack, score]]) => {
        return [color(str, editstack), score, str, editstack]
    }).slice(0, 10)

    // eslint-disable-next-line no-unused-vars
    for (const [str, dist, original, editstack] of coloredResult) {
        console.log(str, Math.round(dist*100)/100)
    }
}

async function main() {
    const deputes = {}//await require('./deputes.json')
    const idx = buildIndex(deputes)
    const results = search(idx, "mel", true)//{ i: 39372, j: 1000 }
    const twiceresults = search(idx, "melenchon", true)//{ i: 766727, j: 40828 }
    console.log(results, twiceresults)
}

if (require.main === module) main()