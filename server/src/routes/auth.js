// Connexion et profil de l'utilisateur connecté.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { creerJeton, requireAuth, asyncRoute, HttpError } from '../auth.js';

const router = Router();

// POST /api/auth/connexion  { email, motDePasse }
router.post('/connexion', asyncRoute(async (req, res) => {
  const { email, motDePasse } = req.body || {};
  if (!email || !motDePasse) {
    throw new HttpError(400, 'Email et mot de passe requis');
  }
  const { rows } = await query(
    'SELECT id, email, mot_de_passe, role, nom, prenom, actif FROM utilisateur WHERE email = $1 AND deleted_at IS NULL',
    [email.trim().toLowerCase()]
  );
  const utilisateur = rows[0];
  // Même message si l'email n'existe pas ou si le mot de passe est faux (sécurité)
  if (!utilisateur || !utilisateur.actif || !(await bcrypt.compare(motDePasse, utilisateur.mot_de_passe))) {
    throw new HttpError(401, 'Email ou mot de passe incorrect');
  }
  res.json({
    jeton: creerJeton(utilisateur),
    utilisateur: profil(utilisateur),
  });
}));

// GET /api/auth/moi : qui est connecté ?
router.get('/moi', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query(
    'SELECT id, email, role, nom, prenom, actif FROM utilisateur WHERE id = $1 AND deleted_at IS NULL',
    [req.user.id]
  );
  if (!rows[0]) throw new HttpError(401, 'Compte introuvable');
  res.json({ utilisateur: profil(rows[0]) });
}));

function profil(u) {
  return { id: u.id, email: u.email, role: u.role, nom: u.nom, prenom: u.prenom };
}

export default router;
