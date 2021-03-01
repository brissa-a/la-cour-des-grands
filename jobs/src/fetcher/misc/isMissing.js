function isMissing(obj, mandatory, name = "") {
  if (!obj) {
    return [name]
  } else if (mandatory) {
    return Object.getOwnPropertyNames(mandatory).flatMap(prop => {
      return mandatory[prop] ? isMissing(obj[prop],mandatory[prop],`${name}.${prop}`) : []
    })
  }
  return []
}

function isMissingThrow(obj, mandatory) {
  let missingFields = isMissing(obj, mandatory)
  if (missingFields.length) {
    const err = new Error();
    err.missingFields = missingFields
    throw err
  }
}

async function main() {
  isMissing({a:"A"}, {
        a: {
          e: true,
          f: true
        },
        b: true
    }
  ).forEach(missingField => console.log(`A${missingField} is missing`))
  try {
    isMissingThrow({a:"A"}, {
          a: {
            e: true,
            f: true
          },
          b: true
      }
    )
  } catch (e) {
    console.log("Excpetion", e)
  }
}

if (require.main === module) main()

module.exports = {isMissing, isMissingThrow}
