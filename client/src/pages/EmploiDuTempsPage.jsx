// Emploi du temps. Le secrétariat crée les créneaux. La base de données refuse tout chevauchement
// (même classe, même enseignant ou même salle) : le message d'erreur est affiché tel quel.
import { useEffect, useState } from 'react';
import { api, JOURS, heure } from '../api.js';
import { useSession } from '../session.jsx';

export default function EmploiDuTempsPage() {
  const { utilisateur } = useSession();
  const gestion = ['administrateur', 'secretariat'].includes(utilisateur.role);
  const [creneaux, setCreneaux] = useState([]);
  const [classes, setClasses] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [salles, setSalles] = useState([]);
  const [classeFiltre, setClasseFiltre] = useState('');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [form, setForm] = useState({ classe_id: '', matiere_id: '', enseignant_id: '', salle_id: '', jour_semaine: 1, debut: '08:00', fin: '09:00' });

  function charger() {
    const q = classeFiltre ? `?classe_id=${classeFiltre}` : '';
    api.get(`/creneaux${q}`).then(setCreneaux).catch((e) => setErreur(e.message));
  }
  useEffect(charger, [classeFiltre]);

  useEffect(() => {
    api.get('/classes?annee=2026-2027').then(setClasses).catch(() => {});
    api.get('/matieres?annee=2026-2027').then(setMatieres).catch(() => {});
    api.get('/enseignants').then(setEnseignants).catch(() => {});
    api.get('/salles').then(setSalles).catch(() => {});
  }, []);

  async function ajouter(e) {
    e.preventDefault();
    setErreur(''); setSucces('');
    try {
      await api.post('/creneaux', { ...form, jour_semaine: Number(form.jour_semaine), salle_id: form.salle_id || null, enseignant_id: form.enseignant_id, annee_scolaire: '2026-2027' });
      setSucces('Créneau ajouté.');
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function supprimer(id) {
    setErreur(''); setSucces('');
    try {
      await api.delete(`/creneaux/${id}`);
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Emploi du temps</h1>
          <p className="doux">Semaine type — année 2026-2027</p>
        </div>
        <div className="champ" style={{ minWidth: 220 }}>
          <label htmlFor="cf">Classe</label>
          <select id="cf" value={classeFiltre} onChange={(e) => setClasseFiltre(e.target.value)}>
            <option value="">Toutes les classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}
          </select>
        </div>
      </div>

      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      {gestion && (
        <div className="carte">
          <h2>Ajouter un créneau</h2>
          <form onSubmit={ajouter}>
            <div className="ligne-form">
              <div className="champ">
                <label>Classe</label>
                <select value={form.classe_id} onChange={(e) => setForm({ ...form, classe_id: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}
                </select>
              </div>
              <div className="champ">
                <label>Matière</label>
                <select value={form.matiere_id} onChange={(e) => setForm({ ...form, matiere_id: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.niveau})</option>)}
                </select>
              </div>
              <div className="champ">
                <label>Enseignant</label>
                <select value={form.enseignant_id} onChange={(e) => setForm({ ...form, enseignant_id: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {enseignants.map((en) => <option key={en.enseignant_id} value={en.enseignant_id}>{en.prenom} {en.nom}</option>)}
                </select>
              </div>
              <div className="champ">
                <label>Salle</label>
                <select value={form.salle_id} onChange={(e) => setForm({ ...form, salle_id: e.target.value })}>
                  <option value="">Aucune</option>
                  {salles.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              </div>
              <div className="champ">
                <label>Jour</label>
                <select value={form.jour_semaine} onChange={(e) => setForm({ ...form, jour_semaine: e.target.value })}>
                  {JOURS.slice(1).map((j, i) => <option key={j} value={i + 1}>{j}</option>)}
                </select>
              </div>
              <div className="champ"><label>Début</label><input type="time" value={form.debut} onChange={(e) => setForm({ ...form, debut: e.target.value })} required /></div>
              <div className="champ"><label>Fin</label><input type="time" value={form.fin} onChange={(e) => setForm({ ...form, fin: e.target.value })} required /></div>
            </div>
            <button className="bouton" type="submit">Ajouter le créneau</button>
          </form>
        </div>
      )}

      {creneaux.length === 0 ? <div className="carte vide">Aucun créneau pour le moment.</div> : (
        JOURS.slice(1).map((jour, index) => {
          const duJour = creneaux.filter((c) => c.jour_semaine === index + 1);
          if (duJour.length === 0) return null;
          return (
            <div key={jour}>
              <div className="jour">{jour}</div>
              {duJour.map((c) => (
                <div className="creneau" key={c.id}>
                  <div className="entete-page" style={{ marginBottom: 0 }}>
                    <div>
                      <strong>{heure(c.debut_min)} – {heure(c.fin_min)}</strong> · {c.matiere}
                      <div><small>{c.classe} · {c.enseignant}{c.salle ? ` · ${c.salle}` : ''}</small></div>
                    </div>
                    {gestion && <button className="bouton danger petit" onClick={() => supprimer(c.id)}>Supprimer</button>}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}
    </>
  );
}
