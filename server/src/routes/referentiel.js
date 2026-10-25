// Données de base : années scolaires, classes, matières, salles, enseignants, élèves, parents.
// Règle générale : on ne supprime jamais vraiment. On met « deleted_at » (suppression douce).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db.js';
import { requireAuth, requireRole, asyncRoute, HttpError } from '../auth.js';
import { peutVoirEleve } from '../acces.js';

const router = Router();
const gestion = [requireAuth, requireRole('administrateur', 'secretariat')];

// ---------- Années scolaires ----------
router.get('/annees', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query('SELECT * FROM annee_scolaire ORDER BY libelle DESC');
  res.json(rows);
}));

// ---------- Classes ----------
router.get('/classes', requireAuth, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const { rows } = await query(
    `SELECT c.id, c.niveau, c.section, c.capacite_max, c.annee_scolaire,
            c.enseignant_titulaire_id,
            (SELECT COUNT(*)::int FROM inscription i
              WHERE i.classe_id = c.id AND i.statut = 'validee') AS effectif
       FROM classe c
      WHERE c.annee_scolaire = $1 AND c.deleted_at IS NULL
      ORDER BY c.niveau, c.section`,
    [annee]
  );
  res.json(rows);
}));

router.post('/classes', ...gestion, asyncRoute(async (req, res) => {
  const { niveau, section = '', capacite_max, annee_scolaire, enseignant_titulaire_id = null } = req.body || {};
  if (!niveau || !capacite_max || !annee_scolaire) throw new HttpError(400, 'Niveau, capacité et année obligatoires');
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO classe (niveau, section, capacite_max, annee_scolaire, enseignant_titulaire_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [niveau, section, capacite_max, annee_scolaire, enseignant_titulaire_id]
  ));
  res.status(201).json(rows[0]);
}));

router.put('/classes/:id', ...gestion, asyncRoute(async (req, res) => {
  const { niveau, section, capacite_max, enseignant_titulaire_id } = req.body || {};
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `UPDATE classe SET niveau = COALESCE($2, niveau), section = COALESCE($3, section),
            capacite_max = COALESCE($4, capacite_max),
            enseignant_titulaire_id = $5
      WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [req.params.id, niveau, section, capacite_max, enseignant_titulaire_id ?? null]
  ));
  if (!rows[0]) throw new HttpError(404, 'Classe introuvable');
  res.json(rows[0]);
}));

router.delete('/classes/:id', ...gestion, asyncRoute(async (req, res) => {
  const { rowCount } = await transaction(req.user.id, (c) => c.query(
    'UPDATE classe SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [req.params.id]
  ));
  if (!rowCount) throw new HttpError(404, 'Classe introuvable');
  res.json({ ok: true });
}));

// ---------- Matières ----------
router.get('/matieres', requireAuth, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const { rows } = await query(
    `SELECT * FROM matiere WHERE annee_scolaire = $1 AND deleted_at IS NULL ORDER BY niveau, nom`, [annee]
  );
  res.json(rows);
}));

router.post('/matieres', ...gestion, asyncRoute(async (req, res) => {
  const { nom, niveau, coefficient, annee_scolaire } = req.body || {};
  if (!nom || !niveau || !coefficient || !annee_scolaire) throw new HttpError(400, 'Nom, niveau, coefficient et année obligatoires');
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO matiere (nom, niveau, coefficient, annee_scolaire) VALUES ($1, $2, $3, $4) RETURNING *`,
    [nom, niveau, coefficient, annee_scolaire]
  ));
  res.status(201).json(rows[0]);
}));

// ---------- Salles ----------
router.get('/salles', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query('SELECT * FROM salle WHERE deleted_at IS NULL ORDER BY nom');
  res.json(rows);
}));

router.post('/salles', ...gestion, asyncRoute(async (req, res) => {
  const { nom, capacite } = req.body || {};
  if (!nom || !capacite) throw new HttpError(400, 'Nom et capacité obligatoires');
  const { rows } = await transaction(req.user.id, (c) => c.query(
    'INSERT INTO salle (nom, capacite) VALUES ($1, $2) RETURNING *', [nom, capacite]
  ));
  res.status(201).json(rows[0]);
}));

// ---------- Enseignants (compte + fiche) ----------
router.get('/enseignants', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT e.id AS enseignant_id, u.id AS utilisateur_id, u.nom, u.prenom, u.email
       FROM enseignant e JOIN utilisateur u ON u.id = e.utilisateur_id
      WHERE e.deleted_at IS NULL ORDER BY u.nom, u.prenom`
  );
  res.json(rows);
}));

router.post('/enseignants', ...gestion, asyncRoute(async (req, res) => {
  const { nom, prenom, email, motDePasse = 'enseignant123' } = req.body || {};
  if (!nom || !prenom || !email) throw new HttpError(400, 'Nom, prénom et email obligatoires');
  const hash = await bcrypt.hash(motDePasse, 10);
  const resultat = await transaction(req.user.id, async (c) => {
    const u = await c.query(
      `INSERT INTO utilisateur (email, mot_de_passe, role, nom, prenom)
       VALUES ($1, $2, 'enseignant', $3, $4) RETURNING id`,
      [email.trim().toLowerCase(), hash, nom, prenom]
    );
    const e = await c.query(
      'INSERT INTO enseignant (utilisateur_id) VALUES ($1) RETURNING id', [u.rows[0].id]
    );
    return e.rows[0];
  });
  res.status(201).json(resultat);
}));

// ---------- Parents (compte par parent, un parent peut avoir plusieurs enfants) ----------
router.get('/parents', ...gestion, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT p.id AS parent_id, u.id AS utilisateur_id, u.nom, u.prenom, u.email, p.telephone,
            COALESCE(json_agg(json_build_object('eleve_id', e.id, 'nom', e.nom, 'prenom', e.prenom, 'lien', pe.lien))
                     FILTER (WHERE e.id IS NOT NULL), '[]') AS enfants
       FROM parent p
       JOIN utilisateur u ON u.id = p.utilisateur_id
       LEFT JOIN parent_eleve pe ON pe.parent_id = p.id
       LEFT JOIN eleve e ON e.id = pe.eleve_id
      WHERE p.deleted_at IS NULL
      GROUP BY p.id, u.id
      ORDER BY u.nom, u.prenom`
  );
  res.json(rows);
}));

// ---------- Élèves ----------
// Liste des élèves selon le rôle : gestion = tous ; enseignant = ses classes ; parent = ses enfants
router.get('/eleves', requireAuth, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const params = [annee];
  let filtre = '';
  if (req.user.role === 'parent') {
    params.push(req.user.id);
    filtre = `AND e.id IN (SELECT pe.eleve_id FROM parent_eleve pe JOIN parent p ON p.id = pe.parent_id
                            WHERE p.utilisateur_id = $2)`;
  } else if (req.user.role === 'enseignant') {
    params.push(req.user.id);
    filtre = `AND e.id IN (SELECT i2.eleve_id FROM inscription i2 JOIN affectation a ON a.classe_id = i2.classe_id
                            JOIN enseignant en ON en.id = a.enseignant_id WHERE en.utilisateur_id = $2)`;
  } else if (req.user.role === 'eleve') {
    params.push(req.user.id);
    filtre = 'AND e.utilisateur_id = $2';
  } else if (!['administrateur', 'secretariat'].includes(req.user.role)) {
    throw new HttpError(403, 'Accès refusé');
  }
  const { rows } = await query(
    `SELECT e.id, e.matricule, e.nom, e.prenom, e.date_naissance,
            i.statut, i.classe_id, c.niveau, c.section
       FROM eleve e
       LEFT JOIN inscription i ON i.eleve_id = e.id AND i.annee_scolaire = $1
       LEFT JOIN classe c ON c.id = i.classe_id
      WHERE e.deleted_at IS NULL ${filtre}
      ORDER BY e.nom, e.prenom`,
    params
  );
  res.json(rows);
}));

router.get('/eleves/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!(await peutVoirEleve(req.user, req.params.id))) throw new HttpError(403, 'Accès refusé');
  const { rows } = await query('SELECT * FROM eleve WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Élève introuvable');
  // Les antécédents médicaux ne sont visibles que par l'administration et le secrétariat
  if (!['administrateur', 'secretariat'].includes(req.user.role)) delete rows[0].antecedents_medicaux;
  res.json(rows[0]);
}));

// Création d'un élève et de son dossier parent en une seule opération
router.post('/eleves', ...gestion, asyncRoute(async (req, res) => {
  const { matricule, nom, prenom, date_naissance, antecedents_medicaux = null } = req.body || {};
  if (!matricule || !nom || !prenom || !date_naissance) {
    throw new HttpError(400, 'Matricule, nom, prénom et date de naissance obligatoires');
  }
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO eleve (matricule, nom, prenom, date_naissance, antecedents_medicaux)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [matricule, nom, prenom, date_naissance, antecedents_medicaux]
  ));
  res.status(201).json(rows[0]);
}));

// Lier un élève à un parent (compte parent déjà créé)
router.post('/eleves/:id/parents', ...gestion, asyncRoute(async (req, res) => {
  const { parent_id, lien = 'pere' } = req.body || {};
  if (!parent_id) throw new HttpError(400, 'Choisissez le parent');
  await transaction(req.user.id, (c) => c.query(
    'INSERT INTO parent_eleve (parent_id, eleve_id, lien) VALUES ($1, $2, $3)', [parent_id, req.params.id, lien]
  ));
  res.status(201).json({ ok: true });
}));

// ---------- Création d'un compte parent ----------
router.post('/parents', ...gestion, asyncRoute(async (req, res) => {
  const { nom, prenom, email, telephone = null, motDePasse = 'parent123' } = req.body || {};
  if (!nom || !prenom || !email) throw new HttpError(400, 'Nom, prénom et email obligatoires');
  const hash = await bcrypt.hash(motDePasse, 10);
  const resultat = await transaction(req.user.id, async (c) => {
    const u = await c.query(
      `INSERT INTO utilisateur (email, mot_de_passe, role, nom, prenom)
       VALUES ($1, $2, 'parent', $3, $4) RETURNING id`,
      [email.trim().toLowerCase(), hash, nom, prenom]
    );
    const p = await c.query(
      'INSERT INTO parent (utilisateur_id, telephone) VALUES ($1, $2) RETURNING id', [u.rows[0].id, telephone]
    );
    return p.rows[0];
  });
  res.status(201).json(resultat);
}));

export default router;
