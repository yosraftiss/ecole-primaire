// Inscriptions (critical path 1 du cahier des charges).
// - Parent : envoie une demande pour son enfant.
// - Secrétariat : choisit une classe et valide, ou refuse. La capacité est vérifiée par le serveur.
import { useEffect, useState } from 'react';
import { api, dateFr } from '../api.js';
import { useSession } from '../session.jsx';

const LIBELLES = { en_attente: 'En attente', validee: 'Validée', refusee: 'Refusée' };
const COULEURS = { en_attente: 'orange', validee: 'vert', refusee: 'rouge' };

export default function InscriptionsPage() {
  const { utilisateur } = useSession();
  const gestion = ['administrateur', 'secretariat'].includes(utilisateur.role);
  const [inscriptions, setInscriptions] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [classes, setClasses] = useState([]);
  const [choixClasse, setChoixClasse] = useState({});
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [filtre, setFiltre] = useState('');

  function charger() {
    const q = filtre ? `&statut=${filtre}` : '';
    api.get(`/inscriptions?annee=2026-2027${q}`).then(setInscriptions).catch((e) => setErreur(e.message));
  }
  useEffect(charger, [filtre]);

  useEffect(() => {
    api.get('/classes?annee=2026-2027').then(setClasses).catch(() => {});
    // Parent : ses enfants. Secrétariat : tous les élèves.
    api.get('/eleves?annee=2026-2027').then(setEleves).catch(() => {});
  }, [utilisateur.role]);

  // Élèves qui n'ont pas encore de demande d'inscription cette année
  const enfantsSansInscription = eleves.filter((e) => !e.statut);

  async function demander(eleveId) {
    setErreur(''); setSucces('');
    try {
      await api.post('/inscriptions', { eleve_id: eleveId, annee_scolaire: '2026-2027' });
      setSucces(gestion ? 'Demande créée. Choisissez la classe dans le tableau ci-dessous.' : 'Demande envoyée au secrétariat.');
      api.get('/eleves?annee=2026-2027').then(setEleves);
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function valider(id) {
    setErreur(''); setSucces('');
    const classeId = choixClasse[id];
    if (!classeId) {
      setErreur("Choisissez d'abord la classe de l'élève.");
      return;
    }
    try {
      await api.post(`/inscriptions/${id}/valider`, { classe_id: classeId });
      setSucces('Inscription validée.');
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function refuser(id) {
    setErreur(''); setSucces('');
    try {
      await api.post(`/inscriptions/${id}/refuser`, {});
      setSucces('Demande refusée.');
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Inscriptions</h1>
          <p className="doux">Année scolaire 2026-2027</p>
        </div>
        {gestion && (
          <div className="champ" style={{ minWidth: 200 }}>
            <label htmlFor="filtre">Afficher</label>
            <select id="filtre" value={filtre} onChange={(e) => setFiltre(e.target.value)}>
              <option value="">Toutes les demandes</option>
              <option value="en_attente">En attente</option>
              <option value="validee">Validées</option>
              <option value="refusee">Refusées</option>
            </select>
          </div>
        )}
      </div>

      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      {enfantsSansInscription.length > 0 && (
        <div className="carte">
          <h2>{gestion ? "Élèves sans demande d'inscription" : "Demander l'inscription de mon enfant"}</h2>
          {enfantsSansInscription.map((e) => (
            <div key={e.id} className="entete-page" style={{ marginBottom: 10 }}>
              <span>{e.prenom} {e.nom} ({e.matricule})</span>
              <button className="bouton" onClick={() => demander(e.id)}>
                {gestion ? 'Créer la demande' : 'Envoyer la demande'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="carte tableau-wrap">
        {inscriptions.length === 0 ? (
          <div className="vide">Aucune inscription pour le moment.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Élève</th>
                <th>Demande du</th>
                <th>Statut</th>
                <th>Classe</th>
                {gestion && <th className="droite">Décision</th>}
              </tr>
            </thead>
            <tbody>
              {inscriptions.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.nom} {i.prenom}</strong><br /><small>{i.matricule}</small></td>
                  <td>{dateFr(i.date_demande)}</td>
                  <td><span className={`badge ${COULEURS[i.statut]}`}>{LIBELLES[i.statut]}</span></td>
                  <td>{i.niveau ? `${i.niveau} ${i.section}` : '—'}</td>
                  {gestion && (
                    <td className="droite">
                      {i.statut === 'en_attente' ? (
                        <div className="actions" style={{ justifyContent: 'flex-end' }}>
                          <select style={{ width: 'auto' }} value={choixClasse[i.id] || ''}
                            onChange={(e) => setChoixClasse({ ...choixClasse, [i.id]: e.target.value })}>
                            <option value="">Choisir une classe…</option>
                            {classes.map((c) => (
                              <option key={c.id} value={c.id} disabled={c.effectif >= c.capacite_max}>
                                {c.niveau} {c.section} ({c.effectif}/{c.capacite_max})
                              </option>
                            ))}
                          </select>
                          <button className="bouton succes petit" onClick={() => valider(i.id)}>Valider</button>
                          <button className="bouton danger petit" onClick={() => refuser(i.id)}>Refuser</button>
                        </div>
                      ) : <small>{dateFr(i.date_validation)}</small>}
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
