const lodash = require('lodash/fp');

const flowAsync = ([...fns]) => async (start) => await fns.reduce(async (state, fn) => fn(await state), start)

const also = (fn) => (x) => {
    fn(x)
    return x
}

Object.assign(module.exports, lodash,  {flowAsync, also})