const config = require("../config.json")
const axios = require('axios');

// {
//  "name": "Jean-Luc Reitzer",
//  "public_metrics": {
//   "followers_count": 1428,
//   "following_count": 242,
//   "tweet_count": 157,
//   "listed_count": 66
//  }

async function fetchTwitterOf(depute) {
  return depute?.twitter_link && fetchTwitter(depute?.twitter_link)
}

async function fetchTwitter(twitter_link) {
  var data;
  try {
    //TODO const config = JSON.parse(fs.readFileSync(program.configFile));
    let pathpart = new URL(twitter_link).pathname.split('/')
    let username = pathpart[pathpart.length - 2].replace('@','').trim();
    const apiurl = `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`
    console.log("Requesting", apiurl)
    const response = await axios.get(
      apiurl,
      {'headers': {'Authorization': `Bearer ${config.twitter_bearer}`}
    });
    data = response.data.data
  } catch(e) {
    data = {
      "error": {
        url: e.config.url,
        status: e.response.status
      }
    }
  }
  return data
}

async function main() {
  const testLink = "https://twitter.com/@Cecile_Rilhac/"
  const response = await fetchTwitter(testLink)
  console.log(response)
}

if (require.main === module) main()

module.exports = {fetchTwitterOf, fetchTwitter}
