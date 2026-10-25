// Notes et bulletins (critical path 2 : saisie de notes).
// 1) choisir la classe  2) créer une évaluation  3) saisir les notes  4) voir les moyennes  5) bulletins (secrétariat)
import { useEffect, useState } from 'react';
import { api, ouvrirPdf } from '../api.js';
import { useSession } from '../session.jsx';

const TYPES = { controle_continu: 'Contrôle continu', trimestriel: 'Examen trimestriel' };

export default function NotesPage() {
  const { utilisateur } = useSession();
  const gestion = ['administrateur', 'secretariat'].includes(utilisateur.role);
  const [classes, setClasses] = useState([]);
  const [affectations, setAffectations] = useState([]);
  const [classeId, setClasseId] = useState('');
  const [trimestre, setTrimestre] = useState(1);
  const [evaluations, setEvaluations] = useState([]);
  const [evaluationOuverte, setEvaluationOuverte] = useState(null); // { evaluation, notes }
  const [saisie, setSaisie] = useState({});                         // { eleve_id: { valeur, commentaire } }
  const [moyennes, setMoyennes] = useState([]);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [nouvelle, setNouvelle] = useState({ matiere_id: '', libelle: '', type: 'controle_continu', bareme: 20, date_evaluation: '' });

  useEffect(() => {
    api.get('/classes?annee=2026-2027').then((c) => {
      setClasses(c);
      if (c.length) setClasseId(c[0].id);
    }).catch((e) => setErreur(e.message));
    api.get('/affectations?annee=2026-2027').then(setAffectations).catch(() => {});
  }, []);

  // Les matières proposées pour la classe choisie
  const matieres = affectations
    .filter((a) => a.classe_id === classeId)
    .reduce((liste, a) => (liste.some((m) => m.matiere_id === a.matiere_id) ? liste : [...liste, { matiere_id: a.matiere_id, nom: a.matiere }]), []);

  useEffect(() => {
    if (!classeId) return;
    setEvaluationOuverte(null);
    api.get(`/evaluations?classe_id=${classeId}&annee=2026-2027&trimestre=${trimestre}`)
      .then(setEvaluations).catch((e) => setErreur(e.message));
    api.get(`/classes/${classeId}/moyennes?trimestre=${trimestre}&annee=2026-2027`)
      .then(setMoyennes).catch(() => setMoyennes([]));
  }, [classeId, trimestre]);

  async function creerEvaluation(e) {
    e.preventDefault();
    setErreur(''); setSucces('');
    try {
      await api.post('/evaluations', { ...nouvelle, classe_id: classeId, annee_scolaire: '2026-2027', trimestre: Number(trimestre) });
      setSucces('Évaluation créée. Vous pouvez saisir les notes.');
      setNouvelle({ ...nouvelle, libelle: '', date_evaluation: '' });
      const liste = await api.get(`/evaluations?classe_id=${classeId}&annee=2026-2027&trimestre=${trimestre}`);
      setEvaluations(liste);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function ouvrir(evaluation) {
    setErreur(''); setSucces('');
    try {
      const donnees = await api.get(`/evaluations/${evaluation.id}/notes`);
      setEvaluationOuverte(donnees);
      const depart = {};
      donnees.notes.forEach((n) => { depart[n.eleve_id] = { valeur: n.valeur ?? '', commentaire: n.commentaire ?? '' }; });
      setSaisie(depart);
    } catch (err) {
      setErreur(err.message);
    }
  }

  function modifier(eleveId, champ, valeur) {
    setSaisie({ ...saisie, [eleveId]: { ...saisie[eleveId], [champ]: valeur } });
  }

  // Enregistre toutes les notes du tableau d'un coup. Le serveur refuse une note au-dessus du barème.
  async function enregistrer() {
    setErreur(''); setSucces('');
    const notes = Object.entries(saisie).map(([eleve_id, v]) => ({ eleve_id, valeur: v.valeur, commentaire: v.commentaire }));
    try {
      const r = await api.put(`/evaluations/${evaluationOuverte.evaluation.id}/notes`, { notes });
      setSucces(`${r.enregistrees} note(s) enregistrée(s).`);
      const m = await api.get(`/classes/${classeId}/moyennes?trimestre=${trimestre}&annee=2026-2027`);
      setMoyennes(m);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function genererBulletins() {
    setErreur(''); setSucces('');
    if (!window.confirm('Générer les bulletins PDF de toute la classe pour ce trimestre ?')) return;
    try {
      const r = await api.post(`/classes/${classeId}/bulletins`, { trimestre: Number(trimestre), annee: '2026-2027' });
      setSucces(`${r.bulletins} bulletin(s) généré(s).`);
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function voirBulletin(eleveId) {
    setErreur('');
    try {
      const liste = await api.get(`/eleves/${eleveId}/bulletins`);
      const dernier = liste.find((b) => Number(b.trimestre) === Number(trimestre));
      if (!dernier) throw new Error('Pas encore de bulletin pour ce trimestre. Générez les bulletins.');
      await ouvrirPdf(`/bulletins/${dernier.id}/pdf`);
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Notes et bulletins</h1>
          <p className="doux">Les notes sont ramenées sur 20 pour calculer les moyennes.</p>
        </div>
        <div className="actions">
          <div className="champ" style={{ minWidth: 220 }}>
            <label htmlFor="classe">Classe</label>
            <select id="classe" value={classeId} onChange={(e) => setClasseId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}
            </select>
          </div>
          <div className="champ" style={{ minWidth: 150 }}>
            <label htmlFor="trim">Trimestre</label>
            <select id="trim" value={trimestre} onChange={(e) => setTrimestre(e.target.value)}>
              <option value={1}>1er trimestre</option>
              <option value={2}>2e trimestre</option>
              <option value={3}>3e trimestre</option>
            </select>
          </div>
        </div>
      </div>

      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      <div className="carte">
        <h2>Nouvelle évaluation</h2>
        <form onSubmit={creerEvaluation}>
          <div className="ligne-form">
            <div className="champ">
              <label>Matière</label>
              <select value={nouvelle.matiere_id} onChange={(e) => setNouvelle({ ...nouvelle, matiere_id: e.target.value })} required>
                <option value="">Choisir…</option>
                {matieres.map((m) => <option key={m.matiere_id} value={m.matiere_id}>{m.nom}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Intitulé</label>
              <input value={nouvelle.libelle} onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })} placeholder="Ex. Dictée n°2" required />
            </div>
            <div className="champ">
              <label>Type</label>
              <select value={nouvelle.type} onChange={(e) => setNouvelle({ ...nouvelle, type: e.target.value })}>
                {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Barème</label>
              <input type="number" min="1" step="0.5" value={nouvelle.bareme} onChange={(e) => setNouvelle({ ...nouvelle, bareme: e.target.value })} />
            </div>
            <div className="champ">
              <label>Date</label>
              <input type="date" value={nouvelle.date_evaluation} onChange={(e) => setNouvelle({ ...nouvelle, date_evaluation: e.target.value })} required />
            </div>
          </div>
          <button className="bouton" type="submit">Créer l'évaluation</button>
        </form>
      </div>

      <div className="carte tableau-wrap">
        <h2>Évaluations du trimestre</h2>
        {evaluations.length === 0 ? <div className="vide">Aucune évaluation ce trimestre.</div> : (
          <table>
            <thead>
              <tr><th>Intitulé</th><th>Matière</th><th>Type</th><th>Date</th><th className="droite">Barème</th><th></th></tr>
            </thead>
            <tbody>
              {evaluations.map((ev) => (
                <tr key={ev.id}>
                  <td><strong>{ev.libelle}</strong></td>
                  <td>{ev.matiere}</td>
                  <td>{TYPES[ev.type]}</td>
                  <td>{new Date(ev.date_evaluation).toLocaleDateString('fr-FR')}</td>
                  <td className="droite">/ {Number(ev.bareme)}</td>
                  <td className="droite"><button className="bouton secondaire petit" onClick={() => ouvrir(ev)}>Saisir les notes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {evaluationOuverte && (
        <div className="carte tableau-wrap">
          <h2>{evaluationOuverte.evaluation.libelle} — saisie (sur {Number(evaluationOuverte.evaluation.bareme)})</h2>
          <table>
            <thead>
              <tr><th>Élève</th><th>Note</th><th>Commentaire</th></tr>
            </thead>
            <tbody>
              {evaluationOuverte.notes.map((n) => (
                <tr key={n.eleve_id}>
                  <td><strong>{n.nom} {n.prenom}</strong><br /><small>{n.matricule}</small></td>
                  <td>
                    <input className="note" type="number" min="0" step="0.25"
                      value={saisie[n.eleve_id]?.valeur ?? ''}
                      onChange={(e) => modifier(n.eleve_id, 'valeur', e.target.value)} />
                  </td>
                  <td>
                    <input value={saisie[n.eleve_id]?.commentaire ?? ''}
                      onChange={(e) => modifier(n.eleve_id, 'commentaire', e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <button className="bouton succes" onClick={enregistrer}>Enregistrer toutes les notes</button>
            <small>Une case vide n'est pas enregistrée.</small>
          </div>
        </div>
      )}

      <div className="carte tableau-wrap">
        <h2>Moyennes du trimestre</h2>
        {moyennes.length === 0 ? <div className="vide">Pas encore de notes pour ce trimestre.</div> : (
          <table>
            <thead>
              <tr><th>Élève</th><th>Matières notées</th><th className="droite">Moyenne générale</th><th className="droite">Bulletin</th></tr>
            </thead>
            <tbody>
              {moyennes.map((m) => (
                <tr key={m.eleve_id}>
                  <td><strong>{m.nom} {m.prenom}</strong></td>
                  <td>{m.matieres.map((x) => `${x.matiere} : ${x.moyenne.toFixed(2)}`).join(' · ') || '—'}</td>
                  <td className="droite"><strong>{m.moyenne_generale === null ? '—' : m.moyenne_generale.toFixed(2)}</strong></td>
                  <td className="droite">
                    {gestion && <button className="bouton secondaire petit" onClick={() => voirBulletin(m.eleve_id)}>Voir le PDF</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {gestion && moyennes.length > 0 && (
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="bouton" onClick={genererBulletins}>Générer les bulletins de la classe</button>
          </div>
        )}
      </div>
    </>
  );
}
