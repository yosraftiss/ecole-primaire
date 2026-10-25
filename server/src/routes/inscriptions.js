// Inscriptions (CU « Inscriptions » du cahier des charges).
// Étapes : 1) le parent envoie une demande pour son enfant (en_attente)
//          2) le secrétariat choisit une classe et valide (validee) ou refuse (refusee)
// La validation vérifie qu'il reste une place dans la classe.
import { Router } from 'express';
import { query, transaction } from '../db.js';
import { requireAuth, requireRole, asyncRoute, HttpError } from '../auth.js';
import { peutVoirEleve } from '../acces.js';

const router = Router();
const gestion = [requireAuth, requireRole('administrateur', 'secretariat')];

// Liste des inscriptions de l'année.
// Secrétariat / administrateur : toutes. Parent : seulement ses enfants.
router.get('/inscriptions', requireAuth, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const statut = req.query.statut || null;
  const params = [annee, statut];
  let filtreParent = '';

  if (req.user.role === 'parent') {
    params.push(req.user.id);
    filtreParent = `AND i.eleve_id IN (SELECT pe.eleve_id FROM parent_eleve pe
                                         JOIN parent p ON p.id = pe.parent_id
                                        WHERE p.utilisateur_id = $3)`;
  } else if (!['administrateur', 'secretariat'].includes(req.user.role)) {
    throw new HttpError(403, "Vous n'avez pas le droit de voir les inscriptions");
  }

  const { rows } = await query(
    `SELECT i.id, i.statut, i.date_demande, i.date_validation, i.classe_id,
            e.id AS eleve_id, e.matricule, e.nom, e.prenom,
            c.niveau, c.section
       FROM inscription i
       JOIN eleve e ON e.id = i.eleve_id
       LEFT JOIN classe c ON c.id = i.classe_id
      WHERE i.annee_scolaire = $1
        AND ($2::text IS NULL OR i.statut::text = $2)
        ${filtreParent}
      ORDER BY i.date_demande`,
    params
  );
  res.json(rows);
}));

// Demande d'inscription : le parent pour son enfant, ou le secrétariat pour un élève
router.post('/inscriptions', requireAuth, asyncRoute(async (req, res) => {
  const { eleve_id, annee_scolaire = '2026-2027' } = req.body || {};
  if (!eleve_id) throw new HttpError(400, "Choisissez l'élève");
  const gestionnaire = ['administrateur', 'secretariat'].includes(req.user.role);
  if (!gestionnaire && !(await peutVoirEleve(req.user, eleve_id))) {
    throw new HttpError(403, "Cet élève n'est pas lié à votre compte");
  }
  const { rows } = await query(
    `INSERT INTO inscription (eleve_id, annee_scolaire)
     VALUES ($1, $2)
     ON CONFLICT (eleve_id, annee_scolaire) DO NOTHING
     RETURNING *`,
    [eleve_id, annee_scolaire]
  );
  if (!rows[0]) throw new HttpError(409, 'Une inscription existe déjà pour cet élève cette année');
  res.status(201).json(rows[0]);
}));

// Validation : choix de la classe, contrôle de la capacité, puis statut « validee »
router.post('/inscriptions/:id/valider', ...gestion, asyncRoute(async (req, res) => {
  const { classe_id } = req.body || {};
  if (!classe_id) throw new HttpError(400, 'Choisissez la classe');

  const resultat = await transaction(req.user.id, async (c) => {
    // Verrouille la classe : deux validations en même temps ne peuvent pas dépasser la capacité
    const classe = await c.query(
      `SELECT id, capacite_max, annee_scolaire FROM classe
        WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [classe_id]
    );
    if (!classe.rows[0]) throw new HttpError(404, 'Classe introuvable');

    const ins = await c.query('SELECT * FROM inscription WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!ins.rows[0]) throw new HttpError(404, 'Inscription introuvable');
    if (ins.rows[0].annee_scolaire !== classe.rows[0].annee_scolaire) {
      throw new HttpError(400, "La classe n'est pas de la même année scolaire");
    }

    const effectif = await c.query(
      `SELECT COUNT(*)::int AS n FROM inscription
        WHERE classe_id = $1 AND statut = 'validee' AND id <> $2`, [classe_id, req.params.id]
    );
    if (effectif.rows[0].n >= classe.rows[0].capacite_max) {
      throw new HttpError(409, 'Classe complète : choisissez une autre classe');
    }

    const maj = await c.query(
      `UPDATE inscription
          SET statut = 'validee', classe_id = $2, date_validation = now(), valide_par_id = $3
        WHERE id = $1 RETURNING *`,
      [req.params.id, classe_id, req.user.id]
    );
    return maj.rows[0];
  });
  res.json(resultat);
}));

// Refus d'une demande
router.post('/inscriptions/:id/refuser', ...gestion, asyncRoute(async (req, res) => {
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `UPDATE inscription SET statut = 'refusee', date_validation = now(), valide_par_id = $2
      WHERE id = $1 AND statut <> 'validee' RETURNING *`,
    [req.params.id, req.user.id]
  ));
  if (!rows[0]) throw new HttpError(404, 'Inscription introuvable ou déjà validée');
  res.json(rows[0]);
}));

export default router;
