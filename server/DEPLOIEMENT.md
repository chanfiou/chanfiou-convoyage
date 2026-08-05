# Mettre le serveur en ligne

À faire une seule fois, depuis un ordinateur. Comptez vingt minutes.
Tout ce qui suit est gratuit et ne demande aucune carte bancaire.

## 1. Préparer l'ordinateur

Installez Node.js depuis <https://nodejs.org> (version LTS).
Ouvrez ensuite un terminal dans le dossier `server` de ce projet.

## 2. Créer le compte et se connecter

Créez un compte sur <https://dash.cloudflare.com/sign-up>, puis :

```
npx wrangler login
```

Une page s'ouvre dans le navigateur, vous autorisez l'accès.

## 3. Créer la base de données

```
npx wrangler d1 create chanfiou-convoyage
```

La commande affiche un `database_id`. Recopiez-le dans `wrangler.toml`,
à la place de `a-remplacer-apres-creation`.

Créez ensuite les tables :

```
npx wrangler d1 execute chanfiou-convoyage --remote --file=./schema.sql
```

## 4. Choisir votre mot de passe

Générez l'empreinte de votre mot de passe. Elle seule est stockée sur le
serveur, jamais le mot de passe lui-même :

```
node genere-mot-de-passe.mjs "votre-mot-de-passe-choisi"
```

Enregistrez les trois secrets, en collant la valeur demandée à chaque fois :

```
npx wrangler secret put OPERATOR_EMAIL
npx wrangler secret put OPERATOR_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

- `OPERATOR_EMAIL` : votre adresse électronique de connexion.
- `OPERATOR_PASSWORD_HASH` : l'empreinte affichée à l'étape précédente.
- `SESSION_SECRET` : une longue suite de caractères au hasard, que la commande
  précédente vous a également proposée.

## 5. Publier

```
npx wrangler deploy
```

La commande affiche l'adresse de votre serveur, du type
`https://chanfiou-convoyage-api.votre-compte.workers.dev`.

## 6. Restreindre l'accès à votre application

Dans `wrangler.toml`, remplacez `ALLOWED_ORIGIN = "*"` par l'adresse exacte de
votre application, par exemple :

```
ALLOWED_ORIGIN = "https://chanfiou-convoyage.netlify.app"
```

Puis republiez avec `npx wrangler deploy`. Sans cette étape, n'importe quel
site pourrait interroger votre serveur depuis un navigateur.

## 7. Relier l'application

Sur votre téléphone, ouvrez l'application, allez dans **Espace convoyeur**,
collez l'adresse du serveur, appuyez sur **Enregistrer et tester**, puis
connectez-vous avec votre adresse et votre mot de passe.

Vos clients n'ont rien à configurer : leurs demandes partent automatiquement
dès qu'ils utilisent votre lien.

## Vérifier que tout va bien

```
curl https://votre-serveur.workers.dev/api/health
```

Doit répondre `{"status":"ok","service":"chanfiou-convoyage"}`.

## Ce que le plan gratuit couvre

100 000 écritures et 5 millions de lectures par jour, 5 Go de stockage,
aucune mise en pause après inactivité. À votre volume, vous ne paierez rien.

## Si vous changez de mot de passe

Régénérez l'empreinte, puis `npx wrangler secret put OPERATOR_PASSWORD_HASH`.
Changez aussi `SESSION_SECRET` pour déconnecter tous les appareils.
