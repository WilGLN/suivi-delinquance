# API d’extraction PDF — Observatoire de la Délinquance

Ce serveur extrait les données des rapports PDF (Observatoire de la Délinquance) et les renvoie en JSON pour l’application.

## Démarrage

À la racine du projet :

```bash
npm run api
```

Ou depuis ce dossier :

```bash
npm start
```

L’API écoute sur **http://localhost:3001**.

## Endpoint

- **POST /api/parse-pdf**  
  - Corps : `multipart/form-data` avec un champ `file` (fichier PDF).  
  - Réponse : objet avec `commune`, `mois`, `moisLabel`, `annee`, `population`, `surface`, `densite`, `indicateurs`, etc.

## Utilisation avec l’app

1. Démarrer l’API : `npm run api`
2. Démarrer le front : `npm run dev`
3. Ouvrir http://localhost:5173 et importer des PDFs ; les données sont extraites du contenu des fichiers.
