const config = require("../config.json")
const axios = require('axios');
const fetch = require('node-fetch');
const  _ = require('lodash');

// {
//  "name": "Jean-Luc Reitzer",
//  "public_metrics": {
//   "followers_count": 1428,
//   "following_count": 242,
//   "tweet_count": 157,
//   "listed_count": 66
//  }

const correction = {
  "Valérie Rabault": "Valerie_Rabault",
  "Hélène Vainqueur-Christophe": "hvchristophe",
  "Boris Vallaud": "BorisVallaud",
  "Valérie Beauvais": "beauvais2017",
  "Aude Luquet": "AudeLuquet2017",
  "François Ruffin": "Francois_Ruffin", //Pas député dans sa description

  "Nathalie Porte": "nathporte",
  "Moetai Brotherson": "Moetai1",
  "Christian HUTIN": "ChristianHutin",
  "Christophe Jerretie": "cjerretie",// Pourquoi pas trouvé ???? resultat != entre compte perso et compte P&Cie
  "Brune Poirson": "brunepoirson",
  "Gérard Menuel": "MenuelGerard",
  "Muriel Ressiguier": "MRessiguier",
  "Jean-Michel Clément": "jmclement86",
  "Christine Cloarec-Le Nabour": "ChrisCloarec", // Pourquoi pas trouvé ???? Dans autocomplétion mais pas dans résultat
  "Benoit Potterie": "BenoitPotterie",  // Pourquoi pas trouvé ???? Pas d'accent au premier e
  "Sébastien Nadot": "Sebastien_Nadot",


}

async function findTwitterUsernameByNameOf(depute, opt) {
  if (!depute.twitter_username || opt.override) {
    console.log("Twitter username not found requesting")
    console.log(depute)
    return depute?.nom && (correction[depute?.nom] || (await findTwitterUsernameByName(depute?.nom)))
  } else {
    console.log("Twitter username already found")
    return depute.twitter_username
  }
}

async function searchUser(name) {
  let resp;
  while (!resp || resp.error) {
    console.log("twitter.searchUser waiting")
    await new Promise(r => setTimeout(r, Math.random() * 3000));
    console.log("twitter.searchUser requesting")
    try {
      resp = await fetch(`https://twitter.com/i/api/2/search/adaptive.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_entities=true&include_user_entities=true&include_ext_media_color=true&include_ext_media_availability=true&send_error_codes=true&simple_quoted_tweet=true&q=${encodeURI(name)}&result_filter=user&count=20&query_source=typed_query&pc=1&spelling_corrections=1&ext=mediaStats%2ChighlightedLabel`, {
        "headers": config.twitter_headers,
        "referrer": `https://twitter.com/search?q=${encodeURI(name)}&src=typed_query&f=user`,
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "GET",
        "mode": "cors"
      });
    } catch(e) {
      console.log(e)
      resp = {
        error: e
      }
    }
  }
  return resp.json()
}

async function findTwitterUsernameByName(name) {
  const findings = await searchUser(name)
  //const founddepute = asarray.find(x => x.innerText.toLowerCase().includes("député"))
  console.log(JSON.stringify(findings, null, " "))
  return Object.entries(findings.globalObjects.users)
    .map(([key, value]) => value)
    .filter(u => u.description.toLowerCase().includes("député"))
    .sort((a, b) => b.followers_count - a.followers_count)
    .map(u => {
      console.log(u)
      return u.screen_name
    })[0]
}

async function fetchTwitterOfByLink(depute) {
  return depute?.twitter_link && fetchTwitterByLink(depute?.twitter_link)
}

async function fetchTwitterOfByUsername(depute, opt) {
  if (!depute.twitterByUsername || opt.override) {
    console.log("twitterByUsername not found requesting")
    return depute?.twitter_username && await fetchTwitterByUsername(depute?.twitter_username)
  } else {
    console.log("twitterByUsername already found")
    return depute.twitterByUsername
  }
}

async function fetchTwitterByLink(twitter_link) {
  let pathpart = new URL(twitter_link).pathname.split('/')
  let username = pathpart[pathpart.length - 2].replace('@','').trim();
  return await fetchTwitterByUsername(username)
}
// {
//   errors: [
//     {
//       code: 326,
//       message: 'To protect our users from spam and other malicious activity, this account is temporarily locked. Please log in to https://twitter.com to unlock your account.',
//       sub_error_code: 0,
//       bounce_location: 'https://twitter.com/account/access'
//     }
//   ]
// }
async function fetchTwitterByUsername(username) {
  var data;
  while (!data) {
  try {
    const apiurl = `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`
    console.log("Requesting", apiurl)
    const response = await axios.get(
      apiurl,
      {'headers': {'Authorization': `Bearer ${config.twitter_bearer}`}
    });
    data = response.data.data
  } catch (e) {
    console.log(e)
    if (e.response.status == 429) {
      const timeToWait = parseInt(e.response.headers['x-rate-limit-reset']) - Math.round(new Date().getTime() / 1000)
      console.log(`Waiting next reset in ${timeToWait}sc`)
      await new Promise(r => setTimeout(r, timeToWait * 1000));
    } else {
       console.log("Pausing 5sc")
       await new Promise(r => setTimeout(r, 5000));
    }
  }
  }
  return data
}

async function main() {
  const testName = "Karine Lebon"
  const response = await findTwitterUsernameByName(testName)
  console.log(response)
}

if (require.main === module) main()

module.exports = {findTwitterUsernameByNameOf, findTwitterUsernameByName, fetchTwitterOfByLink, fetchTwitterOfByUsername, fetchTwitterByLink, fetchTwitterByUsername}
