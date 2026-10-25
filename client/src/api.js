// Fonctions pour parler au serveur. Chaque fonction renvoie les données ou lève une erreur
// avec le message à afficher à l'utilisateur.

const CLE_JETON = 'ecole.jeton';

export function lireJeton() {
  try {
    return localStorage.getItem(CLE_JETON);
  } catch {
    return null;
  }
}

export function enregistrerJeton(jeton) {
  try {
    if (jeton) localStorage.setItem(CLE_JETON, jeton);
    else localStorage.removeItem(CLE_JETON);
  } catch {
    // Le stockage peut être bloqué (navigation privée) : on continue sans
  }
}

// Appel générique. « corps » est envoyé en JSON. Les fichiers (PDF) sont renvoyés en « blob ».
export async function appeler(methode, chemin, corps, { blob = false } = {}) {
  const entetes = { 'Content-Type': 'application/json' };
  const jeton = lireJeton();
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;

  let reponse;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode,
      headers: entetes,
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch {
    throw new Error('Impossible de joindre le serveur. Vérifiez qu\'il est démarré.');
  }

  if (blob) {
    if (!reponse.ok) throw new Error('Fichier introuvable ou accès refusé');
    return reponse.blob();
  }

  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    if (reponse.status === 401 && chemin !== '/auth/connexion') {
      enregistrerJeton(null);
      window.dispatchEvent(new Event('session-expiree'));
    }
    // Erreur 500 sans message du serveur : le serveur ne répond pas (il n'est pas lancé)
    if (reponse.status >= 500 && !donnees.erreur) {
      throw new Error('Le serveur ne répond pas. Vérifiez que la fenêtre du serveur est ouverte (npm start dans le dossier server).');
    }
    throw new Error(donnees.erreur || `Erreur ${reponse.status}`);
  }
  return donnees;
}

export const api = {
  get: (chemin) => appeler('GET', chemin),
  post: (chemin, corps) => appeler('POST', chemin, corps ?? {}),
  put: (chemin, corps) => appeler('PUT', chemin, corps ?? {}),
  delete: (chemin) => appeler('DELETE', chemin),
  fichier: (chemin) => appeler('GET', chemin, undefined, { blob: true }),
};

// Ouvre un PDF reçu depuis l'API dans un nouvel onglet
export async function ouvrirPdf(chemin) {
  const blob = await api.fichier(chemin);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// Montant en TND avec 3 décimales
export function montant(valeur) {
  return `${Number(valeur || 0).toFixed(3)} TND`;
}

// Date au format français
export function dateFr(valeur) {
  if (!valeur) return '—';
  return new Date(valeur).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Minutes depuis minuit -> « 08:30 »
export function heure(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export const ROLES = {
  administrateur: 'Administrateur',
  secretariat: 'Secrétariat',
  enseignant: 'Enseignant',
  parent: 'Parent',
  eleve: 'Élève',
};
