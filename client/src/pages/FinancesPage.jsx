// Paiements (critical path 3).
// - Secrétariat : enregistrer un paiement (le reçu PDF et le message au parent sont automatiques),
//   voir les impayés et relancer les parents.
// - Parent : voir le solde de chaque enfant et télécharger les reçus.
import { useEffect, useState } from 'react';
import { api, ouvrirPdf, montant, dateFr } from '../api.js';
import { useSession } from '../session.jsx';

const MODES = { especes: 'Espèces', virement: 'Virement', mobile_money: 'Mobile money' };

export default function FinancesPage() {
  const { utilisateur } = useSession();
  const gestion = ['administrateur', 'secretariat'].includes(utilisateur.role);
  return gestion ? <GestionFinances /> : <EspaceFinancierParent />;
}

// ---------- Vue du secrétariat ----------
function GestionFinances() {
  const [eleves, setEleves] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [impayes, setImpayes] = useState([]);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState(null);
  const [form, setForm] = useState({ eleve_id: '', montant: '', mode: 'especes', date_paiement: new Date().toISOString().slice(0, 10), reference: '' });

  function charger() {
    api.get('/paiements?annee=2026-2027').then(setPaiements).catch((e) => setErreur(e.message));
    api.get('/impayes?annee=2026-2027').then(setImpayes).catch(() => {});
  }
  useEffect(() => {
    api.get('/eleves?annee=2026-2027').then((l) => setEleves(l.filter((e) => e.statut === 'validee'))).catch(() => {});
    charger();
  }, []);

  async function enregistrer(e) {
    e.preventDefault();
    setErreur(''); setSucces(null);
    try {
      const p = await api.post('/paiements', { ...form, montant: Number(form.montant) });
      setSucces(p);
      setForm({ ...form, montant: '', reference: '' });
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  async function relancer() {
    setErreur(''); setSucces(null);
    if (!window.confirm('Envoyer une relance aux parents de tous les élèves qui doivent de l\'argent ?')) return;
    try {
      const r = await api.post('/relances', { annee_scolaire: '2026-2027' });
      setErreur('');
      alert(`${r.relances_envoyees} relance(s) envoyée(s). ${r.ignorees} ignorée(s) : une relance a déjà été envoyée cette semaine ou pas de parent lié.`);
      charger();
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Paiements</h1>
          <p className="doux">Montants en dinars tunisiens (TND)</p>
        </div>
      </div>

      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && (
        <div className="alerte succes">
          Paiement de {montant(succes.montant)} enregistré. Reste à payer : {montant(succes.solde_restant)}.
          Le reçu est prêt et le parent l'a reçu par message.{' '}
          <button className="bouton petit" onClick={() => ouvrirPdf(`/paiements/${succes.id}/recu`).catch((e) => setErreur(e.message))}>
            Ouvrir le reçu
          </button>
        </div>
      )}

      <div className="carte">
        <h2>Enregistrer un paiement</h2>
        <form onSubmit={enregistrer}>
          <div className="ligne-form">
            <div className="champ">
              <label>Élève</label>
              <select value={form.eleve_id} onChange={(e) => setForm({ ...form, eleve_id: e.target.value })} required>
                <option value="">Choisir…</option>
                {eleves.map((e) => <option key={e.id} value={e.id}>{e.nom} {e.prenom} ({e.matricule})</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Montant (TND)</label>
              <input type="number" min="0.001" step="0.001" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} required />
            </div>
            <div className="champ">
              <label>Mode</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                {Object.entries(MODES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>Date</label>
              <input type="date" value={form.date_paiement} onChange={(e) => setForm({ ...form, date_paiement: e.target.value })} required />
            </div>
            <div className="champ">
              <label>Référence (facultatif)</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
          </div>
          <button className="bouton" type="submit">Enregistrer et générer le reçu</button>
        </form>
      </div>

      <div className="carte tableau-wrap">
        <div className="entete-page" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Élèves qui doivent encore de l'argent ({impayes.length})</h2>
          <button className="bouton danger petit" onClick={relancer} disabled={impayes.length === 0}>Relancer les parents</button>
        </div>
        {impayes.length === 0 ? <div className="vide">Aucun impayé.</div> : (
          <table>
            <thead><tr><th>Élève</th><th>Classe</th><th className="droite">Dû</th><th className="droite">Payé</th><th className="droite">Reste</th><th>Dernière relance</th></tr></thead>
            <tbody>
              {impayes.map((i) => (
                <tr key={i.eleve_id}>
                  <td><strong>{i.nom} {i.prenom}</strong></td>
                  <td>{i.niveau} {i.section}</td>
                  <td className="droite">{montant(i.total_du)}</td>
                  <td className="droite">{montant(i.total_paye)}</td>
                  <td className="droite"><span className="badge orange">{montant(i.solde_restant)}</span></td>
                  <td>{i.derniere_relance ? dateFr(i.derniere_relance) : 'Jamais'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="carte tableau-wrap">
        <h2>Derniers paiements</h2>
        {paiements.length === 0 ? <div className="vide">Aucun paiement enregistré.</div> : (
          <table>
            <thead><tr><th>Date</th><th>Élève</th><th>Mode</th><th className="droite">Montant</th><th className="droite">Reçu</th></tr></thead>
            <tbody>
              {paiements.map((p) => (
                <tr key={p.id}>
                  <td>{dateFr(p.date_paiement)}</td>
                  <td>{p.nom} {p.prenom}</td>
                  <td>{MODES[p.mode]}</td>
                  <td className="droite"><strong>{montant(p.montant)}</strong></td>
                  <td className="droite">
                    <button className="bouton secondaire petit" onClick={() => ouvrirPdf(`/paiements/${p.id}/recu`).catch((e) => setErreur(e.message))}>Reçu</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- Vue du parent ----------
function EspaceFinancierParent() {
  const [enfants, setEnfants] = useState([]);
  const [situations, setSituations] = useState({});
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    api.get('/eleves?annee=2026-2027').then((liste) => {
      // Seuls les enfants dont l'inscription est validée ont des frais à payer
      const inscrits = liste.filter((e) => e.statut === 'validee');
      setEnfants(inscrits);
      inscrits.forEach((e) => {
        api.get(`/eleves/${e.id}/finances?annee=2026-2027`)
          .then((s) => setSituations((x) => ({ ...x, [e.id]: s })))
          .catch((err) => setErreur(err.message));
      });
    }).catch((e) => setErreur(e.message));
  }, []);

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Paiements de mes enfants</h1>
          <p className="doux">Année scolaire 2026-2027 — montants en TND</p>
        </div>
      </div>
      {erreur && <div className="alerte erreur">{erreur}</div>}
      {enfants.length === 0 && <div className="carte vide">Aucun enfant rattaché à votre compte.</div>}

      {enfants.map((e) => {
        const s = situations[e.id];
        return (
          <div className="carte" key={e.id}>
            <h2>{e.prenom} {e.nom}</h2>
            {!s ? <p className="doux">Chargement…</p> : (
              <>
                <div className="grille" style={{ marginBottom: 16 }}>
                  <div className="indicateur"><div className="valeur">{montant(s.total_du)}</div><div className="libelle">Total à payer</div></div>
                  <div className="indicateur"><div className="valeur">{montant(s.total_paye)}</div><div className="libelle">Déjà payé</div></div>
                  <div className="indicateur"><div className="valeur" style={{ color: s.solde_restant > 0 ? 'var(--alerte)' : 'var(--accent)' }}>{montant(s.solde_restant)}</div><div className="libelle">Reste à payer</div></div>
                </div>
                {s.paiements.length === 0 ? <p className="doux">Aucun paiement enregistré.</p> : (
                  <table>
                    <thead><tr><th>Date</th><th>Mode</th><th className="droite">Montant</th><th className="droite">Reçu</th></tr></thead>
                    <tbody>
                      {s.paiements.map((p) => (
                        <tr key={p.id}>
                          <td>{dateFr(p.date_paiement)}</td>
                          <td>{MODES[p.mode]}</td>
                          <td className="droite">{montant(p.montant)}</td>
                          <td className="droite">
                            <button className="bouton secondaire petit" onClick={() => ouvrirPdf(`/paiements/${p.id}/recu`).catch((err) => setErreur(err.message))}>Télécharger</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
