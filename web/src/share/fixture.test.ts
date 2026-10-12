import type { ReadText } from "../data/source.ts"

const CATALOG = {
  generated: "2026-10-10",
  files: [
    {
      file: "deputies/init.csv",
      entity: "deputy",
      features: [
        { column: "first_name", title: "Prénom", type: "text" },
        { column: "group", title: "Groupe politique", type: "category", values: "deputies/values/group.csv" },
        { column: "age", title: "Âge", type: "number" },
        { column: "in_office", title: "En exercice", type: "category", values: "deputies/values/yes_no.csv" },
      ],
    },
    {
      file: "votes/votes.csv",
      entity: "vote",
      rows: 2,
      features: [
        { column: "kind", title: "Type", type: "category", values: "votes/values/kind.csv" },
        { column: "result", title: "Résultat", type: "category", values: "votes/values/result.csv" },
      ],
    },
  ],
}

const VOTES = `vote_id,number,date,title,kind,result,major,bill,file,url
VTANR5L17V1,1,2024-10-08,"la motion de censure déposée par M. Boris Vallaud, Mme Mathilde Panot et 188 de leurs collègues.",censure_motion,rejected,yes,,deputies/votes/other.csv,https://www.assemblee-nationale.fr/dyn/17/scrutins/1
VTANR5L17V242,242,2024-11-04,l'ensemble de la deuxième partie du projet de loi de financement de la sécurité sociale pour 2025 (première lecture).,ordinary,adopted,yes,,deputies/votes/other.csv,https://www.assemblee-nationale.fr/dyn/17/scrutins/242
`

export const FILES: Readonly<Record<string, string>> = {
  "catalog.json": JSON.stringify(CATALOG),
  "deputies/init.csv": "deputy_id,first_name,last_name,group,age\nPA720892,Mathilde,Panot,LFI-NFP,36\nPA720614,Marine,Le Pen,RN,58\n",
  "votes/votes.csv": VOTES,
  "votes/values/kind.csv": "value,label_fr\nordinary,Scrutin public ordinaire\nsolemn,Scrutin public solennel\ncensure_motion,Motion de censure\n",
  "votes/values/result.csv": "value,label_fr\nadopted,Adopté\nrejected,Rejeté\n",
}

export function readerOf(files: Readonly<Record<string, string>>): ReadText {
  return path => {
    const text = files[path]
    return text === undefined ? Promise.reject(new Error(`${path}: HTTP 404`)) : Promise.resolve(text)
  }
}
