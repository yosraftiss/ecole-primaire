// Devoirs.
// - Enseignant : créer un devoir, puis noter les rendus de chaque élève.
// - Parent : voir l'état des devoirs de chaque enfant (à rendre, rendu, en retard, non rendu) et marquer « vu ».
import { useEffect, useState } from 'react';
import { api, dateFr } from '../api.js';
import { useSession } from '../session.jsx';

const ETATS = {
  a_rendre: ['À rendre', 'bleu'],
  rendu: ['Rendu', 'vert'],
  en_retard: ['Rendu en retard', 'orange'],
  non_rendu: ['Non rendu', 'rouge'],
};

export default function DevoirsPage() {
  const { utilisateur } = useSession();
  return utilisateur.role === 'parent' ? <DevoirsParent /> : <DevoirsEnseignant />;
}

// ---------- Enseignant ----------
function DevoirsEnseignant() {
  const [devoirs, setDevoirs] = useState([]);
  const [affectations, setAffectations] = useState([]);
  const [ouvert, setOuvert] = useState(null);     // devoir ouvert
  const [rendus, setRendus] = useState([]);       // élèves de la classe du devoir
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [form, setForm] = useState({ classe_id: '', matiere_id: '', titre: '', description: '', date_remise: '' });

  function charger() {
    api.get('/devoirs?annee=2026-2027').then(setDevoirs).catch((e) => setErreur(e.message));
  }
  useEffect(() => {
    charger();
    api.get('/affectations?annee=2026-2027').then(setAffectations).catch(() => {});
  }, []);

  // Classes et matières proposées : celles qui sont affectées à l'enseignant
  const classes = [...new Map(affectations.map((a) => [a.classe_id, a.classe])).entries()];
  const matieres = affectations.filter((a) => a.classe_id === form.classe_id);

  async function creer(e) {
    e.preventDefault();
    setErreur(''); setSucces('');
    try {
      await api.post('/devoirs', { ...form, annee_scolaire: '2026-2027' });
      setSucces('Devoir publié. Les parents concernés peuvent le consulter.');
      setForm({ ...form, titre: '', description: '', date_remise: '' });
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function ouvrir(devoir) {
    setErreur(''); setSucces('');
    setOuvert(devoir);
    try {
      setRendus(await api.get(`/devoirs/${devoir.id}/depots`));
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function marquerRendu(eleveId) {
    try {
      await api.post(`/devoirs/${ouvert.id}/depots`, { eleve_id: eleveId });
      setRendus(await api.get(`/devoirs/${ouvert.id}/depots`));
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function enregistrerNote(eleveId, note) {
    setErreur('');
    try {
      await api.post(`/devoirs/${ouvert.id}/depots`, { eleve_id: eleveId, note: note === '' ? null : Number(note) });
      setSucces('Note enregistrée.');
      setRendus(await api.get(`/devoirs/${ouvert.id}/depots`));
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Devoirs</h1>
          <p className="doux">Publiez un devoir, puis indiquez qui l'a rendu.</p>
        </div>
      </div>
      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      <div className="carte">
        <h2>Nouveau devoir</h2>
        <form onSubmit={creer}>
          <div className="ligne-form">
            <div className="champ">
              <label>Classe</label>
              <select value={form.classe_id} onChange={(e) => setForm({ ...form, classe_id: e.target.value, matiere_id: '' })} required>
                <option value="">Choisir…</option>
                {classes.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Matière</label>
              <select value={form.matiere_id} onChange={(e) => setForm({ ...form, matiere_id: e.target.value })} required>
                <option value="">Choisir…</option>
                {matieres.map((m) => <option key={m.matiere_id} value={m.matiere_id}>{m.matiere}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Date de remise</label>
              <input type="datetime-local" value={form.date_remise} onChange={(e) => setForm({ ...form, date_remise: e.target.value })} required />
            </div>
          </div>
          <div className="champ">
            <label>Titre</label>
            <input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} required />
          </div>
          <div className="champ">
            <label>Consigne</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button className="bouton" type="submit">Publier le devoir</button>
        </form>
      </div>

      <div className="carte tableau-wrap">
        <h2>Mes devoirs</h2>
        {devoirs.length === 0 ? <div className="vide">Aucun devoir publié.</div> : (
          <table>
            <thead><tr><th>Devoir</th><th>Classe</th><th>Matière</th><th>Remise</th><th></th></tr></thead>
            <tbody>
              {devoirs.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.titre}</strong></td>
                  <td>{d.classe}</td>
                  <td>{d.matiere}</td>
                  <td>{dateFr(d.date_remise)}</td>
                  <td className="droite"><button className="bouton secondaire petit" onClick={() => ouvrir(d)}>Suivre les rendus</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ouvert && (
        <div className="carte tableau-wrap">
          <h2>Rendus : {ouvert.titre}</h2>
          <table>
            <thead><tr><th>Élève</th><th>Dépôt</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {rendus.map((r) => (
                <tr key={r.eleve_id}>
                  <td>{r.nom} {r.prenom}</td>
                  <td>{r.date_depot ? <span className="badge vert">Rendu le {dateFr(r.date_depot)}</span> : <span className="badge rouge">Pas encore rendu</span>}</td>
                  <td style={{ width: 130 }}>
                    <input type="number" className="note" min="0" step="0.5" defaultValue={r.note ?? ''}
                      onBlur={(e) => e.target.value !== String(r.note ?? '') && enregistrerNote(r.eleve_id, e.target.value)} />
                  </td>
                  <td className="droite">
                    {!r.date_depot && <button className="bouton succes petit" onClick={() => marquerRendu(r.eleve_id)}>Marquer rendu</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------- Parent ----------
function DevoirsParent() {
  const [enfants, setEnfants] = useState([]);
  const [devoirs, setDevoirs] = useState({});     // { eleve_id: [ ... ] }
  const [erreur, setErreur] = useState('');

  function charger() {
    api.get('/eleves?annee=2026-2027').then((liste) => {
      setEnfants(liste);
      liste.forEach((e) => {
        api.get(`/eleves/${e.id}/devoirs`)
          .then((l) => setDevoirs((d) => ({ ...d, [e.id]: l })))
          .catch((err) => setErreur(err.message));
      });
    }).catch((e) => setErreur(e.message));
  }
  useEffect(charger, []);

  async function marquerVu(devoirId, eleveId) {
    try {
      await api.post(`/devoirs/${devoirId}/vu`, { eleve_id: eleveId });
      setDevoirs((d) => ({ ...d, [eleveId]: d[eleveId].map((x) => (x.id === devoirId ? { ...x, vu: true } : x)) }));
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Devoirs de mes enfants</h1>
          <p className="doux">Cliquez sur « Vu » après avoir consulté un devoir.</p>
        </div>
      </div>
      {erreur && <div className="alerte erreur">{erreur}</div>}
      {enfants.length === 0 && <div className="carte vide">Aucun enfant rattaché à votre compte.</div>}

      {enfants.map((e) => (
        <div className="carte tableau-wrap" key={e.id}>
          <h2>{e.prenom} {e.nom}</h2>
          {!devoirs[e.id] ? <p className="doux">Chargement…</p> : devoirs[e.id].length === 0 ? (
            <div className="vide">Aucun devoir pour le moment.</div>
          ) : (
            <table>
              <thead><tr><th>Devoir</th><th>Matière</th><th>Remise</th><th>État</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {devoirs[e.id].map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.titre}</strong>{d.description && <><br /><small>{d.description}</small></>}</td>
                    <td>{d.matiere}</td>
                    <td>{dateFr(d.date_remise)}</td>
                    <td><span className={`badge ${ETATS[d.etat][1]}`}>{ETATS[d.etat][0]}</span></td>
                    <td>{d.note ?? '—'}</td>
                    <td className="droite">
                      {d.vu ? <small>Vu</small> : <button className="bouton secondaire petit" onClick={() => marquerVu(d.id, e.id)}>Marquer « vu »</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  );
}
