**Code source du site web https://cour-des-grands.fr/**
# Pour commencer...

## Structure du projet

```
/     
├── jobs/
│    ├── dl/
├── react-app/
```

Le dossier `jobs/` contient tous les programmes d'import des données et images utilisées par le site web.
Les données sont enregistrés dans le dossier `jobs/dl/` qui est dans le .gitignore. Les données sont ensuite copiés dans `react-app/` qui est l'application web.
Ce référer au readme de chaque sous dossier pour en savoir plus.

## New front (`web/`)

A rewrite of the front that reads the v2 data published by `pipeline/` in [lcdg-data](https://github.com/brissa-a/lcdg-data). Specification: [docs/front-spec.md](docs/front-spec.md).

```bash
cd web
npm install
npm run dev      # local server
npm run check    # type check
npm test         # unit tests
./deploy.sh      # build and publish to https://lcdg-v2-preview.s3-website.fr-par.scw.cloud
```

`deploy.sh` needs the `scw` CLI (configured with `scw init`) and the `aws` CLI.
