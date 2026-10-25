// Classes, matières et affectations des enseignants.
// Le secrétariat et l'administrateur créent et modifient ; l'enseignant consulte.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSession } from '../session.jsx';

export default function ClassesPage() {
  const { utilisateur } = useSession();
  const gestion = ['administrateur', 'secretariat'].includes(utilisateur.role);
  const [classes, setClasses] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [affectations, setAffectations] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [classe, setClasse] = useState({ niveau: 'CP', section: '', capacite_max: 25 });
  const [matiere, setMatiere] = useState({ nom: '', niveau: 'CP', coefficient: 1 });
  const [affect, setAffect] = useState({ enseignant_id: '', matiere_id: '', classe_id: '' });

  function charger() {
    api.get('/classes?annee=2026-2027').then(setClasses).catch((e) => setErreur(e.message));
    api.get('/matieres?annee=2026-2027').then(setMatieres).catch(() => {});
    api.get('/affectations?annee=2026-2027').then(setAffectations).catch(() => {});
    api.get('/enseignants').then(setEnseignants).catch(() => {});
  }
  useEffect(charger, []);

  async function essayer(action, message) {
    setErreur(''); setSucces('');
    try {
      await action();
      setSucces(message);
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Classes et matières</h1>
          <p className="doux">Année scolaire 2026-2027</p>
        </div>
      </div>
      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      <div className="carte tableau-wrap">
        <h2>Classes</h2>
        <table>
          <thead><tr><th>Classe</th><th>Élèves validés</th><th>Capacité</th><th>Places libres</th></tr></thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.niveau} {c.section}</strong></td>
                <td>{c.effectif}</td>
                <td>{c.capacite_max}</td>
                <td>{c.capacite_max - c.effectif > 0 ? <span className="badge vert">{c.capacite_max - c.effectif}</span> : <span className="badge rouge">Complète</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {gestion && (
          <form style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); essayer(() => api.post('/classes', { ...classe, annee_scolaire: '2026-2027' }), 'Classe créée.'); }}>
            <h3>Ajouter une classe</h3>
            <div className="ligne-form">
              <div className="champ"><label>Niveau</label><input value={classe.niveau} onChange={(e) => setClasse({ ...classe, niveau: e.target.value })} required /></div>
              <div className="champ"><label>Section</label><input value={classe.section} onChange={(e) => setClasse({ ...classe, section: e.target.value })} placeholder="A, B…" /></div>
              <div className="champ"><label>Capacité</label><input type="number" min="1" value={classe.capacite_max} onChange={(e) => setClasse({ ...classe, capacite_max: e.target.value })} required /></div>
            </div>
            <button className="bouton" type="submit">Créer la classe</button>
          </form>
        )}
      </div>

      <div className="carte tableau-wrap">
        <h2>Matières</h2>
        <table>
          <thead><tr><th>Matière</th><th>Niveau</th><th className="droite">Coefficient</th></tr></thead>
          <tbody>
            {matieres.map((m) => (
              <tr key={m.id}><td>{m.nom}</td><td>{m.niveau}</td><td className="droite">{Number(m.coefficient)}</td></tr>
            ))}
          </tbody>
        </table>
        {gestion && (
          <form style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); essayer(() => api.post('/matieres', { ...matiere, annee_scolaire: '2026-2027' }), 'Matière ajoutée.'); }}>
            <h3>Ajouter une matière</h3>
            <div className="ligne-form">
              <div className="champ"><label>Nom</label><input value={matiere.nom} onChange={(e) => setMatiere({ ...matiere, nom: e.target.value })} required /></div>
              <div className="champ"><label>Niveau</label><input value={matiere.niveau} onChange={(e) => setMatiere({ ...matiere, niveau: e.target.value })} required /></div>
              <div className="champ"><label>Coefficient</label><input type="number" min="0.1" step="0.5" value={matiere.coefficient} onChange={(e) => setMatiere({ ...matiere, coefficient: e.target.value })} required /></div>
            </div>
            <button className="bouton" type="submit">Ajouter la matière</button>
          </form>
        )}
      </div>

      <div className="carte tableau-wrap">
        <h2>Qui enseigne quoi</h2>
        <table>
          <thead><tr><th>Enseignant</th><th>Matière</th><th>Classe</th></tr></thead>
          <tbody>
            {affectations.map((a, i) => (
              <tr key={i}><td>{a.enseignant}</td><td>{a.matiere}</td><td>{a.classe}</td></tr>
            ))}
          </tbody>
        </table>
        {gestion && (
          <form style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); essayer(() => api.post('/affectations', affect), 'Affectation enregistrée.'); }}>
            <h3>Ajouter une affectation</h3>
            <div className="ligne-form">
              <div className="champ">
                <label>Enseignant</label>
                <select value={affect.enseignant_id} onChange={(e) => setAffect({ ...affect, enseignant_id: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {enseignants.map((en) => <option key={en.enseignant_id} value={en.enseignant_id}>{en.prenom} {en.nom}</option>)}
                </select>
              </div>
              <div className="champ">
                <label>Matière</label>
                <select value={affect.matiere_id} onChange={(e) => setAffect({ ...affect, matiere_id: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.niveau})</option>)}
                </select>
              </div>
              <div className="champ">
                <label>Classe</label>
                <select value={affect.classe_id} onChange={(e) => setAffect({ ...affect, classe_id: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}
                </select>
              </div>
            </div>
            <button className="bouton" type="submit">Enregistrer l'affectation</button>
          </form>
        )}
      </div>
    </>
  );
}
