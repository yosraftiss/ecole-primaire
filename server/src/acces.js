// Règles d'accès : qui a le droit de voir les informations d'un élève ?
// - administrateur et secrétariat : tout voir
// - enseignant : les élèves des classes où il enseigne
// - parent : seulement ses enfants
// - élève : seulement son propre dossier
import { query } from './db.js';

export async function peutVoirEleve(user, eleveId) {
  if (user.role === 'administrateur' || user.role === 'secretariat') return true;

  let sql;
  if (user.role === 'enseignant') {
    sql = `SELECT 1 FROM inscription i
             JOIN affectation a ON a.classe_id = i.classe_id
             JOIN enseignant en ON en.id = a.enseignant_id
            WHERE i.eleve_id = $2 AND en.utilisateur_id = $1`;
  } else if (user.role === 'parent') {
    sql = `SELECT 1 FROM parent_eleve pe
             JOIN parent p ON p.id = pe.parent_id
            WHERE pe.eleve_id = $2 AND p.utilisateur_id = $1`;
  } else if (user.role === 'eleve') {
    sql = 'SELECT 1 FROM eleve WHERE utilisateur_id = $1 AND id = $2';
  } else {
    return false;
  }
  const { rows } = await query(sql, [user.id, eleveId]);
  return rows.length > 0;
}

// Renvoie l'identifiant de la fiche « parent » du compte connecté (ou null)
export async function idParentDuCompte(userId) {
  const { rows } = await query('SELECT id FROM parent WHERE utilisateur_id = $1 AND deleted_at IS NULL', [userId]);
  return rows[0] ? rows[0].id : null;
}

// Renvoie l'identifiant de la fiche « enseignant » du compte connecté (ou null)
export async function idEnseignantDuCompte(userId) {
  const { rows } = await query('SELECT id FROM enseignant WHERE utilisateur_id = $1 AND deleted_at IS NULL', [userId]);
  return rows[0] ? rows[0].id : null;
}
