function isMissing(obj, toTest, onMissing, name = "") {
  if (!obj) {
    onMissing('.' + name)
    return true
  } else if (toTest) {
    var anyMissing = false
    for (prop in toTest) {
      missing = isMissing(
        obj[prop],
        toTest[prop],
        onMissing,
        `${name}.${prop}`
      )
      anyMissing = anyMissing || missing
    }
    return anyMissing
  }
  return false
}

async function main() {
  isMissing({a:"A"}, {
        a: {
          e: null,
          f: null
        },
        b: true
    },
    missingField => console.log(`A${missingField} is missing`)
  )
}

if (require.main === module) main()

module.exports = {isMissing}
