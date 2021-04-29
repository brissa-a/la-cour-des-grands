declare interface Window {
    deputes?: any
}

type Scrutin = Record<string, string>
type Depute = {
    "an_data_depute": {
        "dateNais": string,
        "femme": boolean,
        "ident": {
            "alpha": string,
            "civ": "M." | "Mme",
            "nom": string,
            "prenom": string,
            "trigramme": string
        },
        "nom": string
    },
    "an_www_depute": {
        "groupe": string,
        "imgurl": string,
        "nosiege": string
    },
    "an_www_pic": {},
    "an_www_social": {
        "facebook_link": string,
        "twitter_link": string
    },
    "circo": {
        "acteurId": string,
        "civ": "M." | "Mme",
        "communes": string[],
        "departement": string,
        "group": string,
        "nom": string,
        "numCirco": string,
        "numDepartement": "01",
        "prenom": "Charles"
    },
    "datan": string,
    "lcdg": {
        "siege": {
            "curAngleIndex": number,
            "curRadiusIndex": number,
            "id": string,
            "no": number,
            "polar": {
                "angle": number,
                "radius": number
            },
            "pos": {
                "x": number,
                "y": number
            }
        }
    },
    "nd_twitter": {
        "twitter": string,
        "url_an": string
    },
    "nosdeputes_link": string,
    "official_link": string,
    "scrutins": Recode<ScrutinId, "P" | "C" | "A" | "N">
    "twitter": {
        "id": string,
        "name": string,
        "public_metrics": {
            "followers_count": number,
            "following_count": number,
            "listed_count": number,
            "tweet_count": number
        },
        "username": string
    },
    "twitter_username": {
        "status": string,
        "value": string
    },
    "uid": string
}