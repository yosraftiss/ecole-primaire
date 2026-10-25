// Connexion à PostgreSQL et petites fonctions utilitaires.
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Requête simple, sans identifiant d'utilisateur (lectures publiques de l'application)
export function query(text, params = []) {
  return pool.query(text, params);
}

// Transaction qui indique à la base QUI fait la modification.
// Le trigger d'audit lit cet identifiant (app.utilisateur_id).
export async function transaction(userId, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.utilisateur_id', $1, true)", [userId || '']);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
