import { download } from "../../core/download.ts";

const REU = "https://static.data.gouv.fr/resources/bureaux-de-vote-et-adresses-de-leurs-electeurs";

export const reuAddresses = download({
  name: "table-adresses-reu.csv",
  url: `${REU}/20230626-140445/table-adresses-reu.csv`,
  sha256: "7560f154f32cd5f9e73d6d0d497d80b615b53fccdb522ea56ef9c82939105e18",
});

export const reuStations = download({
  name: "table-bv-reu.csv",
  url: `${REU}/20230626-135808/table-bv-reu.csv`,
  sha256: "90fb185ee2d72e4c6d32889a2769fc4069e37af01f7baf751a0ea471820d0ca9",
});

export const inseeStations = download({
  name: "2022-bureaux_vote.zip",
  url: "https://www.insee.fr/fr/statistiques/fichier/3539086/2022-bureaux_vote.zip",
  sha256: "af2c598a30306cd84aded1e0618dd6978a0457a00a25542d8875780568d2ec80",
});

export const ministryStations = download({
  name: "bureaux-de-vote-circonscriptions.csv",
  url: "https://static.data.gouv.fr/resources/liste-des-bureaux-de-vote-associes-a-leur-circonscription-legislative/20240612-133914/bureaux-de-vote-circonscriptions.csv",
  sha256: "49cf4eeff6b6f9b6ebdffbed10d5cd9f9c1fe198b4f52612c265fa8e093d2cdd",
});

export const inseeContours = download({
  name: "contours_circonscriptions_legislatives_03052022.zip",
  url: "https://www.insee.fr/fr/statistiques/fichier/6441661/contours_circonscriptions_legislatives_03052022.zip",
  sha256: "bd16cb3c822a03fd5343d628edd37efa719bb129141fdfbd2b814c9da2ddb0df",
});

// Bump every January with INSEE's new COG: the geocoder switches to it soon after.
const COG_YEAR = 2026;
const COG = "https://www.insee.fr/fr/statistiques/fichier/8740222";

export const cogCommunes = download({
  name: `v_commune_${COG_YEAR}.csv`,
  url: `${COG}/v_commune_${COG_YEAR}.csv`,
  sha256: "7be1153de3a63df48fa0ca77f8490c8a0c5c9c4eb12f5cec1ca7f70b0237b1d3",
});

export const cogEvents = download({
  name: `v_mvt_commune_${COG_YEAR}.csv`,
  url: `${COG}/v_mvt_commune_${COG_YEAR}.csv`,
  sha256: "8b339fad8232e97233af3fd9468715af845e2cf8b14cb67b24d9a301ef8645f1",
});
