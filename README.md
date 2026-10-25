# Gestion d'une école primaire

Projet individuel de **Yosra Ftiss** (groupe G03B, LIG2, ISG Sousse).
Basé sur le cahier des charges du Dr Hamdi Hassen (20 octobre 2026).

Ce dossier contient :

| Dossier | Ce qu'il contient |
|---|---|
| `database/` | Le schéma de la base (`schema.sql`) et les données de démonstration (`seed.sql`) |
| `server/` | Le serveur (Node.js + Express + PostgreSQL) : toutes les règles métier |
| `client/` | L'application que vous utilisez dans le navigateur (React) |
| `maquettes/` | Les maquettes des 4 parcours critiques (à ouvrir dans un navigateur) |

---

## 1. Ce qu'il faut installer sur votre PC (une seule fois)

1. **Node.js** (version 20 ou plus récente) : https://nodejs.org → bouton « LTS ».
   Installez-le avec les options par défaut.
2. **PostgreSQL** (version 16 ou plus récente) : https://www.postgresql.org/download/windows/ → « Interactive installer ».
   - Gardez les options par défaut. Laissez le port **5432**.
   - **Notez le mot de passe** que vous donnez à l'utilisateur `postgres`. Vous en aurez besoin.
   - Vous pouvez décocher « Stack Builder » à la fin.
3. Vérifiez : ouvrez l'invite de commandes (touche Windows, tapez `cmd`, Entrée) et tapez :
   ```
   node -v
   npm -v
   ```
   Deux numéros de version doivent s'afficher.

---

## 2. Mettre le projet en place

1. **Dézippez** le fichier `ecole-projet.zip` dans un dossier simple, par exemple `C:\ecole-projet`.
2. Dans le dossier `server`, **copiez** le fichier `.env.example` et **renommez la copie** en `.env`.
   - Sous Windows, ouvrez `.env` avec le Bloc-notes.
   - Remplacez `VOTRE_MOT_DE_PASSE` par le mot de passe de PostgreSQL.
   - Exemple de ligne :
     `DATABASE_URL=postgres://postgres:MonMotDePasse@localhost:5432/ecole`
   - Si votre mot de passe contient `@`, `#` ou `%`, remplacez-les avant : `@` devient `%40`.

---

## 3. Créer la base de données (une seule fois)

Ouvrez l'invite de commandes dans le dossier `server` :

```
cd C:\ecole-projet\server
npm install
npm run init-db
```

Le script :
- crée la base `ecole` ;
- crée toutes les tables et les règles (schéma) ;
- ajoute des données de démonstration.

Vous devez voir : **« Base prête. »**

> Vous n'avez **pas** besoin d'installer `psql` ni de taper des commandes SQL.

Pour tout effacer et recommencer : `npm run init-db -- --reset`

---

## 4. Lancer l'application

Il faut **deux fenêtres** d'invite de commandes.

**Fenêtre 1 : le serveur**

```
cd C:\ecole-projet\server
npm start
```

Laissez cette fenêtre ouverte. Vous devez voir : **« Serveur démarré : http://localhost:3001 »**

**Fenêtre 2 : l'application**

```
cd C:\ecole-projet\client
npm install
npm run dev
```

Ouvrez ensuite votre navigateur à l'adresse : **http://localhost:5173**

---

## 5. Comptes de démonstration

Mot de passe pour **tous** les comptes : `demo1234`

| Rôle | Email | Ce qu'on peut faire |
|---|---|---|
| Administrateur | admin@ecole.tn | Tout |
| Secrétariat | secretariat@ecole.tn | Inscriptions, classes, paiements, emploi du temps |
| Enseignant | enseignant1@ecole.tn | Notes, absences, devoirs, messagerie |
| Parent | parent1@exemple.tn | Ses enfants : notes, absences, devoirs, paiements |

---

## 6. Vérifier que tout fonctionne

Le serveur doit être lancé (fenêtre 1 ouverte). Ouvrez une troisième fenêtre d'invite de commandes :

```
cd C:\ecole-projet\server
npm run test-api
```

Chaque ligne affiche **OK** ou **ECHEC**. Le dernier message doit être :
**« Résultat : 29 réussi(s), 0 échec(s). »**

Après les tests, les données sont modifiées (de nouveaux paiements, de nouvelles absences…).
Pour repartir de zéro : arrêtez le serveur, puis `npm run init-db -- --reset`.

---

## 7. Voir les maquettes

Ouvrez le fichier `C:\ecole-projet\maquettes\index.html` dans votre navigateur.
Chaque maquette explique les écrans avec des repères numérotés.

---

## 8. Problèmes fréquents

| Message ou situation | Ce qu'il faut faire |
|---|---|
| « Échec de l'initialisation » | Vérifiez que PostgreSQL est démarré (services Windows) et que le mot de passe dans `server\.env` est le bon. |
| « Impossible de joindre le serveur » | La fenêtre 1 (`npm start`) doit être ouverte. |
| « Session expirée » | Reconnectez-vous. |
| « Conflit : cet horaire est déjà pris » | Normal : le système empêche deux cours en même temps. Changez l'heure ou la salle. |
| « Classe complète » | Normal : la classe a atteint sa capacité. Choisissez une autre classe. |
| Page blanche | Appuyez sur F5 pour recharger, ou vérifiez la fenêtre 2. |
| `npm` n'est pas reconnu | Réinstallez Node.js puis fermez et rouvrez l'invite de commandes. |

---

## 9. Structure du code (pour comprendre)

```
server/
  src/index.js            point d'entrée : démarre le serveur et branche les routes
  src/db.js               connexion à PostgreSQL et transactions
  src/auth.js             connexion (jeton), droits par rôle, messages d'erreur
  src/acces.js            qui a le droit de voir quel élève
  src/pdf.js              création des bulletins et des reçus (PDF)
  src/messages.js         envoi de messages (utilisé par paiements et relances)
  src/routes/             une page de l'API par module
  scripts/init-db.js      crée la base et la remplit
  scripts/test-api.js     vérifie les parcours principaux
client/
  src/App.jsx             menu (il change selon le rôle) et routes
  src/api.js              appels au serveur
  src/session.jsx         connexion et déconnexion
  src/pages/              une page par module
  src/styles.css          apparence (couleurs définies une seule fois)
database/
  schema.sql              tables, types, contraintes et triggers
  seed.sql                données de démonstration
```

**Idées clés à retenir**

- Les **règles importantes** sont dans la base de données (contraintes et triggers) : même une erreur
  dans le code ne peut pas casser une règle comme « un message envoyé ne se modifie plus ».
- Les **droits d'accès** sont vérifiés côté serveur (`requireRole`, `peutVoirEleve`) : l'interface ne suffit pas.
- Rien n'est vraiment supprimé : on marque la date de suppression (`deleted_at`).

---

## 10. Avant une mise en ligne réelle

Ce projet est une version de travail pour apprendre et démontrer. Avant de le mettre sur Internet :
- changer `JWT_SECRET` par une longue phrase secrète ;
- changer tous les mots de passe de démonstration ;
- utiliser HTTPS ;
- faire des sauvegardes régulières de la base.
