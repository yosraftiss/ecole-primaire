// Accueil : annonces de l'école. La direction et le secrétariat peuvent publier une annonce.
// Une annonce publiée ne peut plus être modifiée ni supprimée (la base de données le garantit).
import { useEffect, useState } from 'react';
import { api, dateFr } from '../api.js';
import { useSession } from '../session.jsx';

const VISIBILITES = { tous: 'Tout le monde', parents: 'Parents seulement', enseignants: 'Enseignants seulement' };

export default function AccueilPage() {
  const { utilisateur } = useSession();
  const peutPublier = ['administrateur', 'secretariat'].includes(utilisateur.role);
  const [annonces, setAnnonces] = useState([]);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [titre, setTitre] = useState('');
  const [corps, setCorps] = useState('');
  const [visibilite, setVisibilite] = useState('tous');
  const gestion = ['administrateur', 'secretariat'].includes(utilisateur.role);
  const [stats, setStats] = useState(null);

  // Tableau de bord (administration et secrétariat) : chiffres calculés à partir des listes existantes
  useEffect(() => {
    if (!gestion) return;
    Promise.all([api.get('/eleves?annee=2026-2027'), api.get('/inscriptions?annee=2026-2027')])
      .then(([eleves, inscriptions]) => {
        setStats({
          eleves: eleves.length,
          sansDemande: eleves.filter((e) => !e.statut).length,
          enAttente: inscriptions.filter((i) => i.statut === 'en_attente').length,
          validees: inscriptions.filter((i) => i.statut === 'validee').length,
        });
      })
      .catch(() => {});
  }, [gestion]);

  useEffect(() => {
    api.get('/annonces').then(setAnnonces).catch((e) => setErreur(e.message));
  }, []);

  async function publier(e) {
    e.preventDefault();
    setErreur(''); setSucces('');
    try {
      const nouvelle = await api.post('/annonces', { titre, corps, visibilite });
      setAnnonces([{ ...nouvelle, auteur: `${utilisateur.prenom} ${utilisateur.nom}` }, ...annonces]);
      setTitre(''); setCorps(''); setVisibilite('tous');
      setSucces('Annonce publiée.');
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Bonjour, {utilisateur.prenom}</h1>
          <p className="doux">Voici les dernières informations de l'école.</p>
        </div>
      </div>

      {stats && (
        <>
          <h2>Tableau de bord</h2>
          <div className="grille" style={{ marginBottom: 26 }}>
            <div className="carte indicateur"><div className="valeur">{stats.eleves}</div><div className="libelle">Élèves enregistrés</div></div>
            <div className="carte indicateur"><div className="valeur">{stats.sansDemande}</div><div className="libelle">Sans demande d'inscription</div></div>
            <div className="carte indicateur"><div className="valeur">{stats.enAttente}</div><div className="libelle">Demandes en attente</div></div>
            <div className="carte indicateur"><div className="valeur">{stats.validees}</div><div className="libelle">Inscriptions validées</div></div>
          </div>
        </>
      )}

      {erreur && <div className="alerte erreur">{erreur}</div>}

      {peutPublier && (
        <div className="carte">
          <h2>Publier une annonce</h2>
          {succes && <div className="alerte succes">{succes}</div>}
          <form onSubmit={publier}>
            <div className="ligne-form">
              <div className="champ">
                <label htmlFor="titre">Titre</label>
                <input id="titre" value={titre} onChange={(e) => setTitre(e.target.value)} required />
              </div>
              <div className="champ">
                <label htmlFor="vis">Destinataires</label>
                <select id="vis" value={visibilite} onChange={(e) => setVisibilite(e.target.value)}>
                  {Object.entries(VISIBILITES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="champ">
              <label htmlFor="corps">Texte</label>
              <textarea id="corps" value={corps} onChange={(e) => setCorps(e.target.value)} required />
            </div>
            <button className="bouton" type="submit">Publier</button>
          </form>
        </div>
      )}

      {annonces.length === 0 && <div className="carte vide">Aucune annonce pour le moment.</div>}

      {annonces.map((a) => (
        <div className="carte" key={a.id}>
          <div className="entete-page" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>{a.titre}</h2>
            <span className="badge bleu">{VISIBILITES[a.visibilite]}</span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{a.corps}</p>
          <small>Publié le {dateFr(a.publiee_le)} par {a.auteur}</small>
        </div>
      ))}
    </>
  );
}
