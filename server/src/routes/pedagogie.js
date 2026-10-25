// Vie pédagogique : affectations, emploi du temps, absences, devoirs, annonces.
import { Router } from 'express';
import { query, transaction } from '../db.js';
import { requireAuth, requireRole, asyncRoute, HttpError } from '../auth.js';
import { peutVoirEleve, idParentDuCompte, idEnseignantDuCompte } from '../acces.js';

const router = Router();
const gestion = [requireAuth, requireRole('administrateur', 'secretariat')];

// Transforme « 08:30 » en minutes depuis minuit (510)
function enMinutes(heure) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(heure || ''));
  if (!m) throw new HttpError(400, `Heure invalide : « ${heure} » (format HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

// ---------- Affectations : qui enseigne quelle matière dans quelle classe ----------
router.get('/affectations', requireAuth, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const { rows } = await query(
    `SELECT a.enseignant_id, a.matiere_id, a.classe_id,
            u.nom || ' ' || u.prenom AS enseignant, m.nom AS matiere, c.niveau || ' ' || c.section AS classe
       FROM affectation a
       JOIN enseignant en ON en.id = a.enseignant_id
       JOIN utilisateur u ON u.id = en.utilisateur_id
       JOIN matiere m ON m.id = a.matiere_id
       JOIN classe c ON c.id = a.classe_id
      WHERE c.annee_scolaire = $1
      ORDER BY c.niveau, m.nom`,
    [annee]
  );
  res.json(rows);
}));

router.post('/affectations', ...gestion, asyncRoute(async (req, res) => {
  const { enseignant_id, matiere_id, classe_id } = req.body || {};
  if (!enseignant_id || !matiere_id || !classe_id) throw new HttpError(400, 'Enseignant, matière et classe obligatoires');
  await transaction(req.user.id, (c) => c.query(
    'INSERT INTO affectation (enseignant_id, matiere_id, classe_id) VALUES ($1, $2, $3)',
    [enseignant_id, matiere_id, classe_id]
  ));
  res.status(201).json({ ok: true });
}));

// ---------- Emploi du temps ----------
router.get('/creneaux', requireAuth, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const { rows } = await query(
    `SELECT cr.id, cr.classe_id, cr.jour_semaine, cr.debut_min, cr.fin_min,
            c.niveau || ' ' || c.section AS classe, m.nom AS matiere,
            u.nom || ' ' || u.prenom AS enseignant, s.nom AS salle
       FROM creneau cr
       JOIN classe c ON c.id = cr.classe_id
       JOIN matiere m ON m.id = cr.matiere_id
       JOIN enseignant en ON en.id = cr.enseignant_id
       JOIN utilisateur u ON u.id = en.utilisateur_id
       LEFT JOIN salle s ON s.id = cr.salle_id
      WHERE cr.annee_scolaire = $1 AND cr.deleted_at IS NULL
        AND ($2::uuid IS NULL OR cr.classe_id = $2)
      ORDER BY cr.jour_semaine, cr.debut_min`,
    [annee, req.query.classe_id || null]
  );
  res.json(rows);
}));

// Création d'un créneau. Si la classe, l'enseignant ou la salle est déjà pris à cette heure,
// la base refuse (erreur 23P01 traduite en « 409 Conflit » par gestionErreurs).
router.post('/creneaux', ...gestion, asyncRoute(async (req, res) => {
  const { classe_id, matiere_id, enseignant_id, salle_id = null, jour_semaine, debut, fin, annee_scolaire = '2026-2027' } = req.body || {};
  if (!classe_id || !matiere_id || !enseignant_id || !jour_semaine || !debut || !fin) {
    throw new HttpError(400, 'Classe, matière, enseignant, jour, début et fin obligatoires');
  }
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO creneau (classe_id, annee_scolaire, matiere_id, enseignant_id, salle_id, jour_semaine, debut_min, fin_min)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [classe_id, annee_scolaire, matiere_id, enseignant_id, salle_id, jour_semaine, enMinutes(debut), enMinutes(fin)]
  ));
  res.status(201).json(rows[0]);
}));

router.delete('/creneaux/:id', ...gestion, asyncRoute(async (req, res) => {
  const { rowCount } = await transaction(req.user.id, (c) => c.query(
    'UPDATE creneau SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [req.params.id]
  ));
  if (!rowCount) throw new HttpError(404, 'Créneau introuvable');
  res.json({ ok: true });
}));

// ---------- Absences ----------
// Liste des absences d'une classe (enseignant de la classe, secrétariat) ou d'un élève
router.get('/absences', requireAuth, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  if (req.query.eleve_id) {
    if (!(await peutVoirEleve(req.user, req.query.eleve_id))) throw new HttpError(403, 'Accès refusé');
  } else if (!['administrateur', 'secretariat', 'enseignant'].includes(req.user.role)) {
    throw new HttpError(403, 'Accès refusé');
  }
  const { rows } = await query(
    `SELECT a.id, a.eleve_id, a.date_absence, a.justifiee, a.justification, a.justifiee_le,
            e.nom, e.prenom
       FROM absence a JOIN eleve e ON e.id = a.eleve_id
      WHERE a.annee_scolaire = $1 AND ($2::uuid IS NULL OR a.eleve_id = $2)
      ORDER BY a.date_absence DESC, e.nom`,
    [annee, req.query.eleve_id || null]
  );
  res.json(rows);
}));

// Saisie d'une absence par l'enseignant (ou le secrétariat)
router.post('/absences', requireAuth, asyncRoute(async (req, res) => {
  const { eleve_id, date_absence, annee_scolaire = '2026-2027' } = req.body || {};
  if (!eleve_id || !date_absence) throw new HttpError(400, 'Élève et date obligatoires');
  if (!['administrateur', 'secretariat', 'enseignant'].includes(req.user.role)) {
    throw new HttpError(403, 'Seuls les enseignants et le secrétariat saisissent les absences');
  }
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO absence (eleve_id, annee_scolaire, date_absence) VALUES ($1, $2, $3) RETURNING *`,
    [eleve_id, annee_scolaire, date_absence]
  ));
  res.status(201).json(rows[0]);
}));

// Justification par le parent
router.post('/absences/:id/justifier', requireAuth, asyncRoute(async (req, res) => {
  const { justification } = req.body || {};
  if (!justification || !justification.trim()) throw new HttpError(400, 'Indiquez le motif de l\'absence');
  if (req.user.role !== 'parent') throw new HttpError(403, 'Seul un parent peut justifier une absence');
  const ab = await query('SELECT eleve_id FROM absence WHERE id = $1', [req.params.id]);
  if (!ab.rows[0]) throw new HttpError(404, 'Absence introuvable');
  if (!(await peutVoirEleve(req.user, ab.rows[0].eleve_id))) throw new HttpError(403, 'Cet enfant ne vous est pas lié');
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `UPDATE absence SET justifiee = true, justification = $2, justifiee_par = $3, justifiee_le = now()
      WHERE id = $1 RETURNING *`,
    [req.params.id, justification.trim(), req.user.id]
  ));
  res.json(rows[0]);
}));

// ---------- Devoirs ----------
// Création d'un devoir par un enseignant affecté à la classe et à la matière
router.post('/devoirs', requireAuth, asyncRoute(async (req, res) => {
  const { classe_id, matiere_id, titre, description = null, date_remise, annee_scolaire = '2026-2027' } = req.body || {};
  if (!classe_id || !matiere_id || !titre || !date_remise) throw new HttpError(400, 'Classe, matière, titre et date de remise obligatoires');
  const enseignantId = await idEnseignantDuCompte(req.user.id);
  if (!enseignantId) throw new HttpError(403, 'Réservé aux enseignants');
  const droit = await query(
    'SELECT 1 FROM affectation WHERE enseignant_id = $1 AND classe_id = $2 AND matiere_id = $3', [enseignantId, classe_id, matiere_id]
  );
  if (!droit.rows[0]) throw new HttpError(403, 'Cette matière ne vous est pas affectée dans cette classe');
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO devoir (classe_id, matiere_id, enseignant_id, annee_scolaire, titre, description, date_remise)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [classe_id, matiere_id, enseignantId, annee_scolaire, titre, description, date_remise]
  ));
  res.status(201).json(rows[0]);
}));

// Devoirs d'un élève avec l'état de chaque devoir (à rendre, rendu, en retard, non rendu, vu)
router.get('/eleves/:id/devoirs', requireAuth, asyncRoute(async (req, res) => {
  if (!(await peutVoirEleve(req.user, req.params.id))) throw new HttpError(403, 'Accès refusé');
  const parentId = await idParentDuCompte(req.user.id);
  const { rows } = await query(
    `SELECT d.id, d.titre, d.description, d.date_remise, m.nom AS matiere,
            dp.date_depot, dp.note, dp.commentaire,
            (cd.vu_le IS NOT NULL) AS vu
       FROM devoir d
       JOIN matiere m ON m.id = d.matiere_id
       JOIN inscription i ON i.classe_id = d.classe_id AND i.eleve_id = $1 AND i.annee_scolaire = d.annee_scolaire
       LEFT JOIN depot dp ON dp.devoir_id = d.id AND dp.eleve_id = $1
       LEFT JOIN consultation_devoir cd ON cd.devoir_id = d.id AND cd.eleve_id = $1 AND cd.parent_id = $2
      WHERE d.deleted_at IS NULL AND i.statut = 'validee'
      ORDER BY d.date_remise DESC`,
    [req.params.id, parentId]
  );
  const maintenant = new Date();
  res.json(rows.map((d) => {
    let etat;
    if (!d.date_depot) etat = new Date(d.date_remise) < maintenant ? 'non_rendu' : 'a_rendre';
    else etat = new Date(d.date_depot) > new Date(d.date_remise) ? 'en_retard' : 'rendu';
    return { ...d, etat };
  }));
}));

// Enseignant : enregistrer qu'un élève a rendu un devoir, et/ou sa note
router.post('/devoirs/:id/depots', requireAuth, asyncRoute(async (req, res) => {
  const { eleve_id, note = null, commentaire = null } = req.body || {};
  if (!eleve_id) throw new HttpError(400, "Choisissez l'élève");
  const d = await query('SELECT enseignant_id FROM devoir WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!d.rows[0]) throw new HttpError(404, 'Devoir introuvable');
  const enseignantId = await idEnseignantDuCompte(req.user.id);
  if (!['administrateur', 'secretariat'].includes(req.user.role) && d.rows[0].enseignant_id !== enseignantId) {
    throw new HttpError(403, 'Seul l\'enseignant du devoir peut le noter');
  }
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO depot (devoir_id, eleve_id, note, commentaire) VALUES ($1, $2, $3, $4)
     ON CONFLICT (devoir_id, eleve_id)
     DO UPDATE SET note = COALESCE(EXCLUDED.note, depot.note),
                   commentaire = COALESCE(EXCLUDED.commentaire, depot.commentaire)
     RETURNING *`,
    [req.params.id, eleve_id, note, commentaire]
  ));
  res.json(rows[0]);
}));

// Liste des devoirs : l'enseignant voit les siens, le secrétariat voit tout
router.get('/devoirs', requireAuth, asyncRoute(async (req, res) => {
  if (!['administrateur', 'secretariat', 'enseignant'].includes(req.user.role)) throw new HttpError(403, 'Accès refusé');
  const annee = req.query.annee || '2026-2027';
  const enseignantId = req.user.role === 'enseignant' ? await idEnseignantDuCompte(req.user.id) : null;
  const { rows } = await query(
    `SELECT d.id, d.titre, d.description, d.date_remise, d.classe_id, d.enseignant_id, d.matiere_id,
            m.nom AS matiere, c.niveau || ' ' || c.section AS classe
       FROM devoir d
       JOIN matiere m ON m.id = d.matiere_id
       JOIN classe c ON c.id = d.classe_id
      WHERE d.deleted_at IS NULL AND d.annee_scolaire = $1
        AND ($2::uuid IS NULL OR d.enseignant_id = $2)
      ORDER BY d.date_remise DESC`,
    [annee, enseignantId]
  );
  res.json(rows);
}));

// Rendus d'un devoir : chaque élève de la classe, avec la date de dépôt, la note et le commentaire
router.get('/devoirs/:id/depots', requireAuth, asyncRoute(async (req, res) => {
  const d = await query('SELECT classe_id, enseignant_id FROM devoir WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!d.rows[0]) throw new HttpError(404, 'Devoir introuvable');
  if (!['administrateur', 'secretariat'].includes(req.user.role)) {
    const enseignantId = await idEnseignantDuCompte(req.user.id);
    if (req.user.role !== 'enseignant' || d.rows[0].enseignant_id !== enseignantId) throw new HttpError(403, 'Accès refusé');
  }
  const { rows } = await query(
    `SELECT e.id AS eleve_id, e.nom, e.prenom, e.matricule, dp.date_depot, dp.note, dp.commentaire
       FROM inscription i
       JOIN eleve e ON e.id = i.eleve_id
       LEFT JOIN depot dp ON dp.eleve_id = e.id AND dp.devoir_id = $1
      WHERE i.classe_id = $2 AND i.statut = 'validee'
      ORDER BY e.nom, e.prenom`,
    [req.params.id, d.rows[0].classe_id]
  );
  res.json(rows);
}));

// Parent : marquer un devoir comme « vu »
router.post('/devoirs/:id/vu', requireAuth, asyncRoute(async (req, res) => {
  const { eleve_id } = req.body || {};
  if (req.user.role !== 'parent') throw new HttpError(403, 'Réservé aux parents');
  if (!eleve_id || !(await peutVoirEleve(req.user, eleve_id))) throw new HttpError(403, 'Cet enfant ne vous est pas lié');
  const parentId = await idParentDuCompte(req.user.id);
  await transaction(req.user.id, (c) => c.query(
    `INSERT INTO consultation_devoir (devoir_id, parent_id, eleve_id) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [req.params.id, parentId, eleve_id]
  ));
  res.json({ ok: true });
}));

// ---------- Annonces (publiées, non modifiables) ----------
// Chacun ne voit que les annonces destinées à son rôle
router.get('/annonces', requireAuth, asyncRoute(async (req, res) => {
  const visibilites = ['tous'];
  if (req.user.role === 'parent') visibilites.push('parents');
  if (req.user.role === 'enseignant') visibilites.push('enseignants');
  if (['administrateur', 'secretariat'].includes(req.user.role)) visibilites.push('parents', 'enseignants');
  const { rows } = await query(
    `SELECT an.id, an.titre, an.corps, an.visibilite, an.publiee_le,
            u.nom || ' ' || u.prenom AS auteur
       FROM annonce an JOIN utilisateur u ON u.id = an.auteur_id
      WHERE an.visibilite::text = ANY($1)
      ORDER BY an.publiee_le DESC`,
    [visibilites]
  );
  res.json(rows);
}));

router.post('/annonces', ...gestion, asyncRoute(async (req, res) => {
  const { titre, corps, visibilite = 'tous' } = req.body || {};
  if (!titre || !corps) throw new HttpError(400, 'Titre et texte obligatoires');
  const { rows } = await transaction(req.user.id, (c) => c.query(
    'INSERT INTO annonce (auteur_id, titre, corps, visibilite) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.user.id, titre, corps, visibilite]
  ));
  res.status(201).json(rows[0]);
}));

export default router;
