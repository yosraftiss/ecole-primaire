// Liste des élèves.
// - Secrétariat / administrateur : liste complète, ajout d'un élève et de son parent.
// - Parent : ses enfants, avec leurs bulletins PDF.
import { useEffect, useState } from 'react';
import { api, ouvrirPdf, dateFr } from '../api.js';
import { useSession } from '../session.jsx';

export default function ElevesPage() {
  const { utilisateur } = useSession();
  const gestion = ['administrateur', 'secretariat'].includes(utilisateur.role);
  const [eleves, setEleves] = useState([]);
  const [bulletins, setBulletins] = useState({});
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [nouveau, setNouveau] = useState({ matricule: '', nom: '', prenom: '', date_naissance: '' });

  function charger() {
    api.get('/eleves?annee=2026-2027').then(setEleves).catch((e) => setErreur(e.message));
  }
  useEffect(charger, []);

  // Pour un parent : les bulletins de chaque enfant
  useEffect(() => {
    if (utilisateur.role !== 'parent') return;
    eleves.forEach((e) => {
      api.get(`/eleves/${e.id}/bulletins`)
        .then((liste) => setBulletins((b) => ({ ...b, [e.id]: liste })))
        .catch(() => {});
    });
  }, [eleves, utilisateur.role]);

  async function ajouter(e) {
    e.preventDefault();
    setErreur(''); setSucces('');
    try {
      await api.post('/eleves', nouveau);
      setNouveau({ matricule: '', nom: '', prenom: '', date_naissance: '' });
      setSucces('Élève ajouté. Vous pouvez maintenant demander son inscription.');
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>{utilisateur.role === 'parent' ? 'Mes enfants' : 'Élèves'}</h1>
          <p className="doux">{eleves.length} élève(s) affiché(s)</p>
        </div>
      </div>

      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      {gestion && (
        <div className="carte">
          <h2>Ajouter un élève</h2>
          <form onSubmit={ajouter}>
            <div className="ligne-form">
              <div className="champ">
                <label>Matricule</label>
                <input value={nouveau.matricule} onChange={(e) => setNouveau({ ...nouveau, matricule: e.target.value })} required />
              </div>
              <div className="champ">
                <label>Nom</label>
                <input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} required />
              </div>
              <div className="champ">
                <label>Prénom</label>
                <input value={nouveau.prenom} onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })} required />
              </div>
              <div className="champ">
                <label>Date de naissance</label>
                <input type="date" value={nouveau.date_naissance} onChange={(e) => setNouveau({ ...nouveau, date_naissance: e.target.value })} required />
              </div>
            </div>
            <button className="bouton" type="submit">Ajouter l'élève</button>
          </form>
        </div>
      )}

      <div className="carte tableau-wrap">
        {eleves.length === 0 ? (
          <div className="vide">Aucun élève à afficher.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Nom et prénom</th>
                <th>Classe</th>
                <th>Inscription</th>
                {utilisateur.role === 'parent' && <th>Bulletins</th>}
              </tr>
            </thead>
            <tbody>
              {eleves.map((e) => (
                <tr key={e.id}>
                  <td>{e.matricule}</td>
                  <td><strong>{e.nom} {e.prenom}</strong><br /><small>Né(e) le {dateFr(e.date_naissance)}</small></td>
                  <td>{e.niveau ? `${e.niveau} ${e.section}` : '—'}</td>
                  <td>
                    {e.statut === 'validee' && <span className="badge vert">Validée</span>}
                    {e.statut === 'en_attente' && <span className="badge orange">En attente</span>}
                    {e.statut === 'refusee' && <span className="badge rouge">Refusée</span>}
                    {!e.statut && <span className="badge">Non inscrit</span>}
                  </td>
                  {utilisateur.role === 'parent' && (
                    <td>
                      {(bulletins[e.id] || []).length === 0 && <small>Aucun bulletin</small>}
                      {(bulletins[e.id] || []).map((b) => (
                        <button key={b.id} className="bouton secondaire petit" style={{ margin: '2px' }}
                          onClick={() => ouvrirPdf(`/bulletins/${b.id}/pdf`).catch((err) => setErreur(err.message))}>
                          Trimestre {b.trimestre} ({b.annee_scolaire})
                        </button>
                      ))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
