// Finances (CU « Paiements »). Montants en dinars tunisiens (TND), 3 décimales.
// Après chaque paiement : reçu PDF + message automatique au(x) parent(s) + trace dans journal_envoi (RM-10).
// Impayés : élèves dont le solde restant est positif. Relance = message envoyé aux parents.
import { Router } from 'express';
import fs from 'node:fs';
import { query, transaction } from '../db.js';
import { requireAuth, requireRole, asyncRoute, HttpError } from '../auth.js';
import { peutVoirEleve } from '../acces.js';
import { cheminStockage, genererRecuPdf, montantTnd } from '../pdf.js';
import { comptesParentsDeEleve, envoyerMessage } from '../messages.js';

const router = Router();
const gestion = [requireAuth, requireRole('administrateur', 'secretariat')];
const MODES = ['especes', 'virement', 'mobile_money'];

// ---------- Frais par niveau ----------
router.get('/frais', ...gestion, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const { rows } = await query(
    'SELECT * FROM frais WHERE annee_scolaire = $1 AND deleted_at IS NULL ORDER BY niveau, libelle', [annee]
  );
  res.json(rows);
}));

router.post('/frais', ...gestion, asyncRoute(async (req, res) => {
  const { annee_scolaire = '2026-2027', niveau, libelle, montant } = req.body || {};
  if (!niveau || !libelle || montant === undefined) throw new HttpError(400, 'Niveau, libellé et montant obligatoires');
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO frais (annee_scolaire, niveau, libelle, montant) VALUES ($1, $2, $3, $4) RETURNING *`,
    [annee_scolaire, niveau, libelle, montant]
  ));
  res.status(201).json(rows[0]);
}));

// ---------- Situation financière d'un élève (solde) ----------
// Renvoie le total dû, le total payé, le reste à payer et la liste des paiements
router.get('/eleves/:id/finances', requireAuth, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  if (!(await peutVoirEleve(req.user, req.params.id))) throw new HttpError(403, 'Accès refusé');
  const solde = await query(
    'SELECT total_du, total_paye, solde_restant FROM solde WHERE eleve_id = $1 AND annee_scolaire = $2',
    [req.params.id, annee]
  );
  const paiements = await query(
    `SELECT id, montant, mode, date_paiement, reference, recu_url
       FROM paiement WHERE eleve_id = $1 AND annee_scolaire = $2 AND deleted_at IS NULL
      ORDER BY date_paiement DESC`,
    [req.params.id, annee]
  );
  res.json({
    total_du: solde.rows[0] ? solde.rows[0].total_du : 0,
    total_paye: solde.rows[0] ? solde.rows[0].total_paye : 0,
    solde_restant: solde.rows[0] ? solde.rows[0].solde_restant : 0,
    paiements: paiements.rows,
  });
}));

// ---------- Paiements ----------
router.get('/paiements', ...gestion, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const { rows } = await query(
    `SELECT p.*, e.nom, e.prenom, e.matricule
       FROM paiement p JOIN eleve e ON e.id = p.eleve_id
      WHERE p.annee_scolaire = $1 AND p.deleted_at IS NULL
      ORDER BY p.date_paiement DESC, p.created_at DESC`,
    [annee]
  );
  res.json(rows);
}));

// Enregistrement d'un paiement : reçu, message au parent, journal
router.post('/paiements', ...gestion, asyncRoute(async (req, res) => {
  const { eleve_id, montant, mode, date_paiement, reference = null, annee_scolaire = '2026-2027' } = req.body || {};
  if (!eleve_id || !montant || !mode || !date_paiement) {
    throw new HttpError(400, 'Élève, montant, mode et date obligatoires');
  }
  if (!MODES.includes(mode)) throw new HttpError(400, 'Mode de paiement inconnu');
  if (Number(montant) <= 0) throw new HttpError(400, 'Le montant doit être supérieur à zéro');

  const resultat = await transaction(req.user.id, async (c) => {
    const insertion = await c.query(
      `INSERT INTO paiement (eleve_id, annee_scolaire, montant, mode, date_paiement, reference, enregistre_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [eleve_id, annee_scolaire, montant, mode, date_paiement, reference, req.user.id]
    );
    const paiement = insertion.rows[0];

    // Informations pour le reçu (lues dans la même transaction, donc à jour)
    const info = await c.query(
      `SELECT e.nom, e.prenom, e.matricule FROM eleve e WHERE e.id = $1`, [eleve_id]
    );
    const solde = await c.query(
      'SELECT total_du, total_paye, solde_restant FROM solde WHERE eleve_id = $1 AND annee_scolaire = $2',
      [eleve_id, annee_scolaire]
    );
    const s = solde.rows[0] || { total_du: 0, total_paye: montant, solde_restant: 0 };
    const numero = `REC-${paiement.id.slice(0, 8).toUpperCase()}`;
    const nomFichier = `${paiement.id}.pdf`;

    await genererRecuPdf(cheminStockage('recus', nomFichier), {
      numero,
      nomEleve: `${info.rows[0].prenom} ${info.rows[0].nom}`,
      matricule: info.rows[0].matricule,
      annee: annee_scolaire,
      montant,
      mode,
      datePaiement: date_paiement,
      reference,
      totalDu: s.total_du,
      totalPaye: s.total_paye,
      solde: s.solde_restant,
    });
    await c.query('UPDATE paiement SET recu_url = $2 WHERE id = $1', [paiement.id, nomFichier]);

    // Message automatique au(x) parent(s) avec le reçu
    const parents = await comptesParentsDeEleve(c, eleve_id);
    if (parents.length > 0) {
      const messageId = await envoyerMessage(c, {
        expediteurId: req.user.id,
        destinataireIds: parents,
        eleveId: eleve_id,
        objet: `Reçu de paiement ${numero}`,
        corps: `Bonjour, nous avons bien reçu ${montantTnd(montant)} pour ${info.rows[0].prenom} ${info.rows[0].nom}.\n`
          + `Reste à payer pour l'année ${annee_scolaire} : ${montantTnd(s.solde_restant)}.\n`
          + 'Le reçu est disponible dans votre espace.',
      });
      for (const parentId of parents) {
        await c.query(
          `INSERT INTO journal_envoi (paiement_id, message_id, destinataire_id, canal, statut)
           VALUES ($1, $2, $3, 'interne', 'envoye')`,
          [paiement.id, messageId, parentId]
        );
      }
    }
    return { ...paiement, recu_url: nomFichier, solde_restant: s.solde_restant };
  });
  res.status(201).json(resultat);
}));

// Téléchargement du reçu (parent de l'élève, secrétariat)
router.get('/paiements/:id/recu', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query('SELECT eleve_id, recu_url FROM paiement WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Paiement introuvable');
  if (!(await peutVoirEleve(req.user, rows[0].eleve_id))) throw new HttpError(403, 'Accès refusé');
  const chemin = cheminStockage('recus', rows[0].recu_url);
  if (!fs.existsSync(chemin)) throw new HttpError(404, 'Reçu introuvable');
  res.sendFile(chemin);
}));

// ---------- Impayés et relances ----------
router.get('/impayes', ...gestion, asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const { rows } = await query(
    `SELECT s.eleve_id, e.nom, e.prenom, e.matricule, c.niveau, c.section,
            s.total_du, s.total_paye, s.solde_restant,
            (SELECT MAX(m.envoye_le) FROM journal_envoi j JOIN message m ON m.id = j.message_id
              WHERE m.eleve_id = s.eleve_id AND m.objet LIKE 'Relance%') AS derniere_relance
       FROM solde s
       JOIN eleve e ON e.id = s.eleve_id
       JOIN inscription i ON i.eleve_id = s.eleve_id AND i.annee_scolaire = s.annee_scolaire
       JOIN classe c ON c.id = i.classe_id
      WHERE s.annee_scolaire = $1 AND s.solde_restant > 0
      ORDER BY s.solde_restant DESC`,
    [annee]
  );
  res.json(rows);
}));

// Relance des impayés : un message par élève. Pas de relance si une a déjà été envoyée depuis 7 jours.
router.post('/relances', ...gestion, asyncRoute(async (req, res) => {
  const annee = req.body?.annee_scolaire || '2026-2027';
  const impayes = await query(
    `SELECT s.eleve_id, e.prenom, e.nom, s.solde_restant
       FROM solde s JOIN eleve e ON e.id = s.eleve_id
      WHERE s.annee_scolaire = $1 AND s.solde_restant > 0`,
    [annee]
  );

  const envoyees = [];
  const ignorees = [];
  for (const dette of impayes.rows) {
    const resultat = await transaction(req.user.id, async (c) => {
      const recente = await c.query(
        `SELECT 1 FROM message m WHERE m.eleve_id = $1 AND m.objet LIKE 'Relance%'
            AND m.envoye_le > now() - interval '7 days' LIMIT 1`,
        [dette.eleve_id]
      );
      if (recente.rows.length > 0) return false;

      const parents = await comptesParentsDeEleve(c, dette.eleve_id);
      if (parents.length === 0) return false;

      const messageId = await envoyerMessage(c, {
        expediteurId: req.user.id,
        destinataireIds: parents,
        eleveId: dette.eleve_id,
        objet: `Relance : solde restant pour ${dette.prenom} ${dette.nom}`,
        corps: `Bonjour, le solde restant à payer pour ${dette.prenom} ${dette.nom} `
          + `(année ${annee}) est de ${montantTnd(dette.solde_restant)}. Merci de régulariser la situation.`,
      });
      for (const parentId of parents) {
        await c.query(
          `INSERT INTO journal_envoi (message_id, destinataire_id, canal, statut)
           VALUES ($1, $2, 'interne', 'envoye')`,
          [messageId, parentId]
        );
      }
      return true;
    });
    (resultat ? envoyees : ignorees).push(dette.eleve_id);
  }
  res.json({ relances_envoyees: envoyees.length, ignorees: ignorees.length });
}));

export default router;
