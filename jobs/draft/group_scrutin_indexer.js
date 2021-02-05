let c = require("string-similarity");
const fs = require('fs');
const _ = require('lodash');
const { group } = require("console");

//console.log(scrutins)

//"l'article 4 du projet de loi portant mesures d'urgence économiques et sociales (première lecture)."
//"l'amendement n° 18 de M. Le Fur et les amendements identiques suivants après l'article 2 du projet de loi portant mesures d'urgence économiques et sociales (première lecture)."
//"la motion de rejet préalable, déposée par M. André Chassaigne, du projet de loi portant mesures d'urgence économiques et sociales (première lecture)."
//"l'ensemble du projet de loi organique relatif au renforcement de l'organisation des juridictions (nouvelle lecture)."
//"l'ensemble du projet de loi organique relatif au renforcement de l'organisation des juridictions (lecture définitive)."
function parseScrutinTitle([id, title]) {
    const regres = /(?<loi>(?<pplOrPjl>projet de loi|proposition de loi).*) \(/gi.exec(title)
    if (regres) {
        const groupname = regres.groups.loi
        const article = /l\'article (?<article>[0-9]+|premier)/gi.exec(title)
        const lecture = /((projet de loi|proposition de loi).*) \((?<lecture>.*)\)\.?$/gi.exec(title)
        const amendement = /(l'amendement n° (?<amendement>[0-9]+|premier).*)/gi.exec(title)
        const ensemble = /^(?<ensemble>l'ensemble)/gi.exec(title)
        return Object.assign(
            {loi: regres.groups.loi, titre: title, id},
            article && article.groups,
            lecture && lecture.groups,
            amendement && amendement.groups,
            ensemble && ensemble.groups
        )
    } else {
        return {loi: "Inclassable", titre: title}
    }
}

function deepGroupBy(collection, [iteratee, ...others]) {
    let grouped = _.groupBy(collection, iteratee);
    if (others.length) {
        for (groupname in grouped) {
            grouped[groupname] = deepGroupBy(grouped[groupname], others)
        }
    }
    return grouped
}

function buildGroup() {
    let scrutins = JSON.parse(fs.readFileSync('./dl/scrutinIdScrutinName.index.json'));
    const parsed = Object.entries(scrutins).map(parseScrutinTitle)
    const groups = deepGroupBy(parsed, [
        x => x.loi,
        x => x.lecture || "lecture inconnue",
        x => x.ensemble ? "AvecEnsemble" : "SansEnsemble",
        x => x.article ? "AvecArticle" : "SansArticle",
        x => x.article ? x.article : "ArticleInconnu",
        x => x.amendement ? "AvecAmendement" : "SansAmendement",
        x => x.amendement ? x.amendement : "AmendementInconnu",
    ])
    return [groups, parsed.length, groups["Inclassable"].length || 'N/A']
}

function buildGroupSimilarity() {
    let scrutins = JSON.parse(fs.readFileSync('./dl/scrutinIdScrutinName.index.json'));
    const group = {[Object.entries(scrutins)[0][1]]: []}
    for ([key, value] of Object.entries(scrutins)) {
        const match = c.findBestMatch(value, Object.keys(group))
        const similarRatings = match.ratings.filter(r => r.rating > 0.6)
        if (similarRatings.length) {
            for (const rating of similarRatings) {
                group[rating.target].push(value)
            }
        } else {
            group[value] = [value]
        }
    }
    return group;
}
//console.log(group)
const [groups, size, missing] = buildGroup()
fs.writeFileSync("test_group_scrutin.json", JSON.stringify(groups));
console.log(missing,"/",size)
//const result = regexp.exec("l'article premier du projet de loi portant mesures d'urgence économiques et sociales (première lecture).")
//console.log(result)
// console.log(c.compareTwoStrings("75012", "coucou jonathan(75012)"))
// console.log(c.compareTwoStrings("75012", "coucou (75010)"))
// console.log(c.compareTwoStrings("75012", "70521"))
// console.log(c.compareTwoStrings(
//     "la motion de rejet préalable, déposée par M. Jean-Luc Mélenchon, de la proposition de loi relative à la sécurité globale (première lecture).",
//     "l'amendement n° 571 de M. Saulignac à l'article 4 de la proposition de loi relative à la sécurité globale (première lecture)."))

// console.log(c.compareTwoStrings(
//     "l'article 16 du projet de loi pour une immigration maîtrisée, un droit d'asile effectif et une intégration réussie (nouvelle lecture)",
//     "l'amendement n° 571 de M. Saulignac à l'article 4 de la proposition de loi relative à la sécurité globale (première lecture)."))

// console.log(c.compareTwoStrings(
// "l'amendement n° 446 de M. Vallaud à l'article premier du projet de loi d'habilitation à prendre par ordonnances les mesures pour le renforcement du dialogue social (première lecture).",
// "l'amendement n° 223 de M. Aviragnet à l'article 5 du projet de loi organique pour la confiance dans la vie publique (première lecture).",
// ))