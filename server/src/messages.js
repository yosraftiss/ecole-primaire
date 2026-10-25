// Fonctions communes pour envoyer un message interne (utilisées par les paiements, les relances et la messagerie).
// Un message envoyé est immuable : la base refuse toute modification (trigger message_immuable).

// Renvoie les comptes utilisateurs des parents d'un élève
export async function comptesParentsDeEleve(c, eleveId) {
  const { rows } = await c.query(
    `SELECT p.utilisateur_id
       FROM parent_eleve pe JOIN parent p ON p.id = pe.parent_id
      WHERE pe.eleve_id = $1 AND p.deleted_at IS NULL`,
    [eleveId]
  );
  return rows.map((r) => r.utilisateur_id);
}

// Crée un message déjà envoyé et l'adresse à chaque destinataire. Renvoie l'identifiant du message.
export async function envoyerMessage(c, { expediteurId, destinataireIds, eleveId = null, objet, corps }) {
  const m = await c.query(
    `INSERT INTO message (expediteur_id, eleve_id, objet, corps, statut, envoye_le)
     VALUES ($1, $2, $3, $4, 'envoye', now()) RETURNING id`,
    [expediteurId, eleveId, objet, corps]
  );
  const messageId = m.rows[0].id;
  for (const destinataireId of destinataireIds) {
    await c.query(
      'INSERT INTO message_destinataire (message_id, destinataire_id) VALUES ($1, $2)',
      [messageId, destinataireId]
    );
  }
  return messageId;
}
