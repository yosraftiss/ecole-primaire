// Initialise la base de données SANS psql :
//  1) crée la base (si elle n'existe pas)
//  2) charge database/schema.sql (tables, règles, triggers)
//  3) charge database/seed.sql (données de démonstration)
// Utilisation :  npm run init-db            (première fois)
//                npm run init-db -- --reset  (efface tout et recrée)
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const reset = process.argv.includes('--reset');
const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ecole');
const nomBase = decodeURIComponent(url.pathname.slice(1));

const dossierDb = fileURLToPath(new URL('../../database/', import.meta.url));

// Connexion à la base « postgres » pour pouvoir créer la nôtre
const urlAdmin = new URL(url.toString());
urlAdmin.pathname = '/postgres';

async function main() {
  // Sur un hébergeur, la base est déjà créée : si la connexion « postgres » est refusée, on continue
  try {
    const admin = new pg.Client({ connectionString: urlAdmin.toString() });
    await admin.connect();
    const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nomBase]);
    if (existe.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${nomBase}"`);
      console.log(`Base « ${nomBase} » créée.`);
    }
    await admin.end();
  } catch (erreur) {
    console.log('Création de la base ignorée (la base existe déjà) :', erreur.message);
  }

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();

  const deja = await client.query("SELECT to_regclass('public.utilisateur') AS t");
  if (deja.rows[0].t !== null) {
    if (!reset) {
      console.log('La base est déjà initialisée. Rien à faire.');
      console.log('Pour tout effacer et recommencer : npm run init-db -- --reset');
      await client.end();
      return;
    }
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Ancien contenu effacé.');
  }

  console.log('Chargement du schéma (tables et règles)...');
  await client.query(fs.readFileSync(dossierDb + 'schema.sql', 'utf8'));

  console.log('Chargement des données de démonstration...');
  // Mot de passe commun aux comptes de démonstration : demo1234
  const hash = await bcrypt.hash('demo1234', 10);
  const seed = fs.readFileSync(dossierDb + 'seed.sql', 'utf8').split('__HASH_DEMO__').join(hash);
  await client.query(seed);

  console.log('Base prête. Comptes de démonstration (mot de passe : demo1234) :');
  console.log('  admin@ecole.tn        (administrateur)');
  console.log('  secretariat@ecole.tn  (secrétariat)');
  console.log('  enseignant1@ecole.tn  (enseignant)');
  console.log('  parent1@exemple.tn    (parent)');
  await client.end();
}

main().catch((erreur) => {
  console.error('Échec de l\'initialisation :', erreur.message);
  console.error('Vérifiez DATABASE_URL dans le fichier server/.env et que PostgreSQL est démarré.');
  process.exit(1);
});
