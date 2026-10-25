// Messagerie (CU « Messagerie ») :
// - un message commence en brouillon (modifiable), puis il est envoyé (immuable)
// - chaque destinataire peut le masquer dans sa boîte, sans le supprimer pour les autres
// - chaque consultation est enregistrée dans l'historique (acces_historique)
// - un parent ne peut écrire qu'au personnel de l'école
import { Router } from 'express';
import { query, transaction } from '../db.js';
import { requireAuth, asyncRoute, HttpError } from '../auth.js';

const router = Router();
const PERSONNEL = ['administrateur', 'secretariat', 'enseignant'];

// Personnes à qui l'utilisateur peut écrire
router.get('/messages/contacts', requireAuth, asyncRoute(async (req, res) => {
  const roles = req.user.role === 'parent' ? PERSONNEL : [...PERSONNEL, 'parent'];
  const { rows } = await query(
    `SELECT id, nom, prenom, role FROM utilisateur
      WHERE role::text = ANY($1) AND id <> $2 AND actif AND deleted_at IS NULL
      ORDER BY role, nom, prenom`,
    [roles, req.user.id]
  );
  res.json(rows);
}));

// Boîte de réception (« recus ») ou messages envoyés (« envoyes »)
router.get('/messages', requireAuth, asyncRoute(async (req, res) => {
  if (req.query.dossier === 'envoyes') {
    const { rows } = await query(
      `SELECT m.id, m.objet, m.statut, m.envoye_le, m.created_at,
              (SELECT string_agg(u.prenom || ' ' || u.nom, ', ')
                 FROM message_destinataire md JOIN utilisateur u ON u.id = md.destinataire_id
                WHERE md.message_id = m.id) AS destinataires
         FROM message m
        WHERE m.expediteur_id = $1
        ORDER BY COALESCE(m.envoye_le, m.created_at) DESC`,
      [req.user.id]
    );
    return res.json(rows);
  }
  const { rows } = await query(
    `SELECT m.id, m.objet, m.envoye_le, md.lu_le,
            u.prenom || ' ' || u.nom AS expediteur
       FROM message_destinataire md
       JOIN message m ON m.id = md.message_id
       JOIN utilisateur u ON u.id = m.expediteur_id
      WHERE md.destinataire_id = $1 AND md.masque = false AND m.statut = 'envoye'
      ORDER BY m.envoye_le DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

// Lecture d'un message : seulement l'expéditeur ou un destinataire. Chaque lecture est journalisée.
router.get('/messages/:id', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT m.*, u.prenom || ' ' || u.nom AS expediteur_nom
       FROM message m JOIN utilisateur u ON u.id = m.expediteur_id
      WHERE m.id = $1`,
    [req.params.id]
  );
  const message = rows[0];
  if (!message) throw new HttpError(404, 'Message introuvable');

  const destinataires = await query(
    `SELECT md.destinataire_id AS id, u.prenom || ' ' || u.nom AS nom, md.lu_le
       FROM message_destinataire md JOIN utilisateur u ON u.id = md.destinataire_id
      WHERE md.message_id = $1`,
    [req.params.id]
  );
  const estDestinataire = destinataires.rows.some((d) => d.id === req.user.id);
  const estExpediteur = message.expediteur_id === req.user.id;
  if (!estDestinataire && !estExpediteur) throw new HttpError(403, 'Ce message ne vous est pas destiné');
  // Un brouillon n'est visible que par son auteur
  if (message.statut === 'brouillon' && !estExpediteur) throw new HttpError(404, 'Message introuvable');

  await transaction(req.user.id, async (c) => {
    await c.query('INSERT INTO acces_historique (message_id, utilisateur_id) VALUES ($1, $2)', [message.id, req.user.id]);
    if (estDestinataire) {
      await c.query(
        'UPDATE message_destinataire SET lu_le = COALESCE(lu_le, now()) WHERE message_id = $1 AND destinataire_id = $2',
        [message.id, req.user.id]
      );
    }
  });
  res.json({ ...message, destinataires: destinataires.rows });
}));

// Création d'un brouillon (rien n'est encore envoyé)
router.post('/messages', requireAuth, asyncRoute(async (req, res) => {
  const { destinataire_ids = [], eleve_id = null, objet, corps } = req.body || {};
  if (!objet || !corps) throw new HttpError(400, 'Objet et message obligatoires');
  if (!Array.isArray(destinataire_ids) || destinataire_ids.length === 0) throw new HttpError(400, 'Choisissez au moins un destinataire');
  await verifierDestinataires(req.user, destinataire_ids);

  const id = await transaction(req.user.id, async (c) => {
    const m = await c.query(
      `INSERT INTO message (expediteur_id, eleve_id, objet, corps, statut)
       VALUES ($1, $2, $3, $4, 'brouillon') RETURNING id`,
      [req.user.id, eleve_id, objet, corps]
    );
    for (const d of destinataire_ids) {
      await c.query('INSERT INTO message_destinataire (message_id, destinataire_id) VALUES ($1, $2)', [m.rows[0].id, d]);
    }
    return m.rows[0].id;
  });
  res.status(201).json({ id });
}));

// Modification d'un brouillon (un message envoyé ne peut plus être modifié)
router.put('/messages/:id', requireAuth, asyncRoute(async (req, res) => {
  const { destinataire_ids = [], objet, corps } = req.body || {};
  await verifierDestinataires(req.user, destinataire_ids);
  await transaction(req.user.id, async (c) => {
    const r = await c.query(
      `UPDATE message SET objet = $3, corps = $4
        WHERE id = $1 AND expediteur_id = $2 AND statut = 'brouillon'`,
      [req.params.id, req.user.id, objet, corps]
    );
    if (r.rowCount === 0) throw new HttpError(404, 'Brouillon introuvable');
    await c.query('DELETE FROM message_destinataire WHERE message_id = $1', [req.params.id]);
    for (const d of destinataire_ids) {
      await c.query('INSERT INTO message_destinataire (message_id, destinataire_id) VALUES ($1, $2)', [req.params.id, d]);
    }
  });
  res.json({ ok: true });
}));

// Envoi : le brouillon devient un message envoyé, il ne peut plus changer
router.post('/messages/:id/envoyer', requireAuth, asyncRoute(async (req, res) => {
  const dest = await query('SELECT destinataire_id FROM message_destinataire WHERE message_id = $1', [req.params.id]);
  if (dest.rows.length === 0) throw new HttpError(400, 'Ajoutez au moins un destinataire avant l\'envoi');
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `UPDATE message SET statut = 'envoye', envoye_le = now()
      WHERE id = $1 AND expediteur_id = $2 AND statut = 'brouillon' RETURNING id, envoye_le`,
    [req.params.id, req.user.id]
  ));
  if (!rows[0]) throw new HttpError(404, 'Brouillon introuvable');
  res.json(rows[0]);
}));

// Suppression : seulement un brouillon (la base refuse la suppression d'un message envoyé)
router.delete('/messages/:id', requireAuth, asyncRoute(async (req, res) => {
  await transaction(req.user.id, async (c) => {
    await c.query('DELETE FROM message_destinataire WHERE message_id = $1', [req.params.id]);
    const r = await c.query(
      "DELETE FROM message WHERE id = $1 AND expediteur_id = $2 AND statut = 'brouillon'",
      [req.params.id, req.user.id]
    );
    if (r.rowCount === 0) throw new HttpError(404, 'Brouillon introuvable');
  });
  res.json({ ok: true });
}));

// Masquer un message dans SA boîte (les autres destinataires le voient toujours)
router.post('/messages/:id/masquer', requireAuth, asyncRoute(async (req, res) => {
  const r = await transaction(req.user.id, (c) => c.query(
    'UPDATE message_destinataire SET masque = true WHERE message_id = $1 AND destinataire_id = $2',
    [req.params.id, req.user.id]
  ));
  if (r.rowCount === 0) throw new HttpError(404, 'Message introuvable dans votre boîte');
  res.json({ ok: true });
}));

// Historique des consultations d'un message (expéditeur ou administrateur)
router.get('/messages/:id/historique', requireAuth, asyncRoute(async (req, res) => {
  const m = await query('SELECT expediteur_id FROM message WHERE id = $1', [req.params.id]);
  if (!m.rows[0]) throw new HttpError(404, 'Message introuvable');
  if (m.rows[0].expediteur_id !== req.user.id && req.user.role !== 'administrateur') {
    throw new HttpError(403, "Seul l'expéditeur ou l'administrateur voit l'historique");
  }
  const { rows } = await query(
    `SELECT h.date_acces, u.prenom || ' ' || u.nom AS utilisateur
       FROM acces_historique h JOIN utilisateur u ON u.id = h.utilisateur_id
      WHERE h.message_id = $1 ORDER BY h.date_acces`,
    [req.params.id]
  );
  res.json(rows);
}));

// Règle : un parent n'écrit qu'au personnel de l'école
async function verifierDestinataires(expediteur, ids) {
  if (ids.length === 0) return;
  if (expediteur.role !== 'parent') return;
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM utilisateur WHERE id = ANY($1::uuid[]) AND role::text = ANY($2)',
    [ids, PERSONNEL]
  );
  if (rows[0].n !== ids.length) throw new HttpError(403, 'Un parent ne peut écrire qu\'au personnel de l\'école');
}

export default router;
