// Absences.
// - Enseignant / secrétariat : cocher les élèves absents d'une classe pour une date donnée.
// - Parent : voir les absences de ses enfants et les justifier (motif obligatoire).
import { useEffect, useState } from 'react';
import { api, dateFr } from '../api.js';
import { useSession } from '../session.jsx';

export default function AbsencesPage() {
  const { utilisateur } = useSession();
  return utilisateur.role === 'parent' ? <AbsencesParent /> : <SaisieAbsences />;
}

// ---------- Enseignant et secrétariat ----------
function SaisieAbsences() {
  const [classes, setClasses] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [classeId, setClasseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [absents, setAbsents] = useState({});
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  useEffect(() => {
    api.get('/classes?annee=2026-2027').then((c) => { setClasses(c); if (c.length) setClasseId(c[0].id); }).catch((e) => setErreur(e.message));
    api.get('/eleves?annee=2026-2027').then(setEleves).catch(() => {});
    api.get('/absences?annee=2026-2027').then(setAbsences).catch(() => {});
  }, []);

  const elevesDeClasse = eleves.filter((e) => e.classe_id === classeId);

  async function enregistrer() {
    setErreur(''); setSucces('');
    const choisis = elevesDeClasse.filter((e) => absents[e.id]);
    if (choisis.length === 0) {
      setErreur('Cochez au moins un élève absent.');
      return;
    }
    let ajoutees = 0;
    let deja = 0;
    for (const e of choisis) {
      try {
        await api.post('/absences', { eleve_id: e.id, date_absence: date, annee_scolaire: '2026-2027' });
        ajoutees += 1;
      } catch (err) {
        if (err.message.includes('doublon') || err.message.includes('existe')) deja += 1;
        else { setErreur(err.message); return; }
      }
    }
    setSucces(`${ajoutees} absence(s) enregistrée(s).${deja ? ` ${deja} étaient déjà notées.` : ''}`);
    setAbsents({});
    api.get('/absences?annee=2026-2027').then(setAbsences);
  }

  const absencesDeClasse = absences.filter((a) => elevesDeClasse.some((e) => e.id === a.eleve_id));

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Absences</h1>
          <p className="doux">Cochez les élèves absents. Les parents peuvent ensuite justifier l'absence.</p>
        </div>
      </div>
      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      <div className="carte">
        <div className="ligne-form" style={{ marginBottom: 6 }}>
          <div className="champ">
            <label>Classe</label>
            <select value={classeId} onChange={(e) => setClasseId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}
            </select>
          </div>
          <div className="champ">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {elevesDeClasse.length === 0 ? <div className="vide">Aucun élève inscrit dans cette classe.</div> : (
          <>
            <table>
              <thead><tr><th>Absent</th><th>Élève</th></tr></thead>
              <tbody>
                {elevesDeClasse.map((e) => (
                  <tr key={e.id}>
                    <td style={{ width: 80 }}>
                      <input type="checkbox" checked={!!absents[e.id]} onChange={(ev) => setAbsents({ ...absents, [e.id]: ev.target.checked })} />
                    </td>
                    <td>{e.nom} {e.prenom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="bouton" onClick={enregistrer}>Enregistrer les absences</button>
            </div>
          </>
        )}
      </div>

      <div className="carte tableau-wrap">
        <h2>Absences récentes de la classe</h2>
        {absencesDeClasse.length === 0 ? <div className="vide">Aucune absence enregistrée.</div> : (
          <table>
            <thead><tr><th>Date</th><th>Élève</th><th>Justification</th></tr></thead>
            <tbody>
              {absencesDeClasse.map((a) => (
                <tr key={a.id}>
                  <td>{dateFr(a.date_absence)}</td>
                  <td>{a.nom} {a.prenom}</td>
                  <td>{a.justifiee ? <span className="badge vert">Justifiée</span> : <span className="badge orange">Non justifiée</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- Parent ----------
function AbsencesParent() {
  const [enfants, setEnfants] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [motifs, setMotifs] = useState({});
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  function charger() {
    api.get('/eleves?annee=2026-2027').then((liste) => {
      setEnfants(liste);
      Promise.all(liste.map((e) => api.get(`/absences?eleve_id=${e.id}&annee=2026-2027`)))
        .then((listes) => setAbsences(listes.flat()))
        .catch((err) => setErreur(err.message));
    }).catch((e) => setErreur(e.message));
  }
  useEffect(charger, []);

  async function justifier(id) {
    setErreur(''); setSucces('');
    try {
      await api.post(`/absences/${id}/justifier`, { justification: motifs[id] || '' });
      setSucces('Absence justifiée. L\'enseignant peut la consulter.');
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Absences de mes enfants</h1>
          <p className="doux">Justifiez chaque absence en indiquant le motif.</p>
        </div>
      </div>
      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      {absences.length === 0 ? <div className="carte vide">Aucune absence enregistrée.</div> : (
        <div className="carte tableau-wrap">
          <table>
            <thead><tr><th>Date</th><th>Enfant</th><th>Statut</th><th>Justification</th></tr></thead>
            <tbody>
              {absences.map((a) => (
                <tr key={a.id}>
                  <td>{dateFr(a.date_absence)}</td>
                  <td>{a.prenom} {a.nom}</td>
                  <td>{a.justifiee ? <span className="badge vert">Justifiée</span> : <span className="badge orange">À justifier</span>}</td>
                  <td>
                    {a.justifiee ? <small>{a.justification}</small> : (
                      <div className="actions">
                        <input placeholder="Motif (ex. maladie)" value={motifs[a.id] || ''} onChange={(e) => setMotifs({ ...motifs, [a.id]: e.target.value })} />
                        <button className="bouton petit" onClick={() => justifier(a.id)}>Justifier</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {enfants.length === 0 && <div className="carte vide">Aucun enfant rattaché à votre compte.</div>}
    </>
  );
}
