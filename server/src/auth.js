// Connexion, vérification du jeton et droits d'accès par rôle (RBAC).
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'secret-de-developpement';

// Erreur « métier » : on choisit le code HTTP et le message
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Crée le jeton de connexion (valable 12 heures)
export function creerJeton(utilisateur) {
  return jwt.sign({ id: utilisateur.id, role: utilisateur.role }, SECRET, { expiresIn: '12h' });
}

// Vérifie le jeton envoyé dans l'en-tête « Authorization: Bearer ... »
export function requireAuth(req, res, next) {
  const entete = req.headers.authorization || '';
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : null;
  if (!jeton) {
    return res.status(401).json({ erreur: 'Connexion requise' });
  }
  try {
    const payload = jwt.verify(jeton, SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ erreur: 'Session expirée, reconnectez-vous' });
  }
}

// Autorise seulement certains rôles. Exemple : requireRole('administrateur', 'secretariat')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ erreur: "Vous n'avez pas le droit de faire cette action" });
    }
    next();
  };
}

// Permet d'écrire « async » dans les routes sans répéter try/catch partout
export function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Traduit les erreurs PostgreSQL en messages compréhensibles
export function gestionErreurs(erreur, req, res, next) {
  if (erreur instanceof HttpError) {
    return res.status(erreur.status).json({ erreur: erreur.message });
  }
  const code = erreur.code;
  if (code === '23P01') {
    // Contrainte EXCLUDE : chevauchement d'horaire ou de salle
    return res.status(409).json({ erreur: 'Conflit : cet horaire est déjà pris (classe, enseignant ou salle)' });
  }
  if (code === '23505') {
    return res.status(409).json({ erreur: 'Cette information existe déjà (doublon)' });
  }
  if (code === '23503') {
    return res.status(409).json({ erreur: 'Impossible : cet élément est utilisé ailleurs' });
  }
  if (code === '23514' || code === '22P02' || code === '22007' || code === '22008') {
    return res.status(400).json({ erreur: 'Donnée invalide : vérifiez les valeurs saisies' });
  }
  if (code === 'P0001') {
    // Message levé par un trigger (ex. message déjà envoyé, note trop haute)
    return res.status(400).json({ erreur: erreur.message });
  }
  console.error(erreur);
  return res.status(500).json({ erreur: 'Erreur interne du serveur' });
}
