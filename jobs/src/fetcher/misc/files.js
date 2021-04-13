const fs = require('fs').promises
const path = require('path')

async function canAccess(filename) {
    let canAccess;
    try {
        await fs.access(filename);
        canAccess = true;
    } catch(e) {
        canAccess = false;
    }
    return canAccess;
}

async function fileCache(filename, creationFct) {
    if (await canAccess(filename)) {
        console.log(`Opening cache ${filename}`)
        return openJson(filename)
    } else {
        console.log(`Writting cache ${filename}`)
        const filecontent = await creationFct()
        await saveJson(filename, filecontent)
        return filecontent;
    }
}

async function openOrDefault(filename, defaultGetter) {
    if (await canAccess(filename)) {
        return openJson(filename)
    } else {
        return defaultGetter()
    }
}

async function openJson(filename) {
    const content = await fs.readFile(filename)
    return JSON.parse(content)
}

async function saveJson(filename, obj, pretty = false) {
    const dir = path.dirname(filename)
    await fs.mkdir(dir, { recursive: true })
    const str = pretty ? jsonStringifyOrdered(obj, " ") : jsonStringifyOrdered(obj)
    return fs.writeFile(filename, str)
}

function jsonStringifyOrdered(obj, space) {
    const allKeys = [];
    JSON.stringify(obj, function (key, value) { allKeys.push(key); return value; })
    allKeys.sort();
    return JSON.stringify(obj, allKeys, space);
}

module.exports = {fileCache, openJson, saveJson, openOrDefault, canAccess}