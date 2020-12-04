# Travailler en local
## Initialiser le projet  
Installer [npm](https://nodejs.org/en/)  
Installer les dépendances avec `npm install`    
Renommer src/config-example.json en src/config.json

## Lancer la webapp  
`npm start` pour démarrer le serveur en local

# Travailler avec Firebase
## Initialiser Firebase
Installer le command line tool de firebase   
`npm install -g firebase-tools`    
puis lancer  
`firebase init`

## Deployer sur firebase  
`npm run build`   
`firebase deploy`

Ou en 2 étapes déployé sur un site de test puis mettre live
`firebase hosting:channel:deploy beta`
`firebase hosting:clone SOURCE_SITE:beta TARGET_SITE:live`
