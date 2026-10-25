// Messagerie (critical path 4).
// Un message est d'abord un brouillon (modifiable), puis il est envoyé (il devient immuable).
// Chaque lecture est enregistrée dans l'historique. Chacun peut masquer un message dans sa propre boîte.
import { useEffect, useState } from 'react';
import { api, dateFr } from '../api.js';
import { useSession } from '../session.jsx';

export default function MessageriePage() {
  const [onglet, setOnglet] = useState('recus');   // recus | envoyes | nouveau
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  return (
    <>
      <div className="entete-page">
        <div>
          <h1>Messagerie</h1>
          <p className="doux">Échanges entre l'école, les enseignants et les parents.</p>
        </div>
      </div>
      {erreur && <div className="alerte erreur">{erreur}</div>}
      {succes && <div className="alerte succes">{succes}</div>}

      <div className="onglets">
        <button className={onglet === 'recus' ? 'actif' : ''} onClick={() => setOnglet('recus')}>Boîte de réception</button>
        <button className={onglet === 'envoyes' ? 'actif' : ''} onClick={() => setOnglet('envoyes')}>Messages envoyés</button>
        <button className={onglet === 'nouveau' ? 'actif' : ''} onClick={() => setOnglet('nouveau')}>Nouveau message</button>
      </div>

      {onglet === 'nouveau' && (
        <Composer onEnvoye={(texte) => { setSucces(texte); setErreur(''); setOnglet('envoyes'); }} onErreur={setErreur} />
      )}
      {onglet === 'recus' && <BoiteRecus onErreur={setErreur} />}
      {onglet === 'envoyes' && <MessagesEnvoyes onErreur={setErreur} onSucces={setSucces} />}
    </>
  );
}

// ---------- Lire un message (commun aux deux boîtes) ----------
function Lecture({ id, onFermer, onErreur }) {
  const { utilisateur } = useSession();
  const [message, setMessage] = useState(null);
  const [historique, setHistorique] = useState(null);
  const estExpediteur = message && message.expediteur_id === utilisateur.id;
  const peutVoirHistorique = estExpediteur || utilisateur.role === 'administrateur';

  useEffect(() => {
    api.get(`/messages/${id}`).then(setMessage).catch((e) => onErreur(e.message));
  }, [id]);

  async function masquer() {
    try {
      await api.post(`/messages/${id}/masquer`, {});
      onFermer(true);
    } catch (e) {
      onErreur(e.message);
    }
  }

  async function voirHistorique() {
    try {
      setHistorique(await api.get(`/messages/${id}/historique`));
    } catch (e) {
      onErreur(e.message);
    }
  }

  if (!message) return <div className="carte doux">Chargement…</div>;
  return (
    <div className="carte">
      <div className="entete-page" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{message.objet}</h2>
        <span className={`badge ${message.statut === 'envoye' ? 'vert' : 'orange'}`}>{message.statut === 'envoye' ? 'Envoyé' : 'Brouillon'}</span>
      </div>
      <small>
        De {message.expediteur_nom} · {message.envoye_le ? `envoyé le ${dateFr(message.envoye_le)}` : 'non envoyé'}
        {message.destinataires?.length > 0 && ` · À : ${message.destinataires.map((d) => d.nom).join(', ')}`}
      </small>
      <p style={{ whiteSpace: 'pre-wrap', marginTop: 14 }}>{message.corps}</p>
      <div className="actions">
        <button className="bouton secondaire petit" onClick={onFermer}>Retour</button>
        {peutVoirHistorique && <button className="bouton secondaire petit" onClick={voirHistorique}>Voir qui a lu</button>}
        {!estExpediteur && <button className="bouton danger petit" onClick={masquer}>Masquer de ma boîte</button>}
      </div>
      {historique && (
        <div style={{ marginTop: 14 }}>
          <h3>Consultations</h3>
          {historique.length === 0 ? <small>Personne n'a encore ouvert ce message.</small> : (
            <ul>{historique.map((h, i) => <li key={i}>{h.utilisateur} — {dateFr(h.date_acces)}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Boîte de réception ----------
function BoiteRecus({ onErreur }) {
  const [messages, setMessages] = useState([]);
  const [ouvert, setOuvert] = useState(null);

  function charger() {
    api.get('/messages').then(setMessages).catch((e) => onErreur(e.message));
  }
  useEffect(charger, []);

  if (ouvert) return <Lecture id={ouvert} onErreur={onErreur} onFermer={(masque) => { setOuvert(null); if (masque) charger(); }} />;

  return (
    <div className="carte tableau-wrap">
      {messages.length === 0 ? <div className="vide">Aucun message reçu.</div> : (
        <table>
          <thead><tr><th>Objet</th><th>De</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => setOuvert(m.id)}>
                <td><strong style={{ fontWeight: m.lu_le ? 400 : 700 }}>{m.objet}</strong></td>
                <td>{m.expediteur}</td>
                <td>{dateFr(m.envoye_le)}</td>
                <td>{!m.lu_le && <span className="badge bleu">Nouveau</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Messages envoyés et brouillons ----------
function MessagesEnvoyes({ onErreur, onSucces }) {
  const [messages, setMessages] = useState([]);
  const [ouvert, setOuvert] = useState(null);

  function charger() {
    api.get('/messages?dossier=envoyes').then(setMessages).catch((e) => onErreur(e.message));
  }
  useEffect(charger, []);

  async function envoyerBrouillon(id) {
    try {
      await api.post(`/messages/${id}/envoyer`, {});
      onSucces('Message envoyé.');
      charger();
    } catch (e) {
      onErreur(e.message);
    }
  }

  async function supprimerBrouillon(id) {
    try {
      await api.delete(`/messages/${id}`);
      charger();
    } catch (e) {
      onErreur(e.message);
    }
  }

  if (ouvert) return <Lecture id={ouvert} onErreur={onErreur} onFermer={() => setOuvert(null)} />;

  return (
    <div className="carte tableau-wrap">
      {messages.length === 0 ? <div className="vide">Aucun message envoyé ni brouillon.</div> : (
        <table>
          <thead><tr><th>Objet</th><th>À</th><th>Statut</th><th className="droite">Actions</th></tr></thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td style={{ cursor: 'pointer' }} onClick={() => setOuvert(m.id)}><strong>{m.objet}</strong></td>
                <td>{m.destinataires || '—'}</td>
                <td>{m.statut === 'envoye' ? <span className="badge vert">Envoyé le {dateFr(m.envoye_le)}</span> : <span className="badge orange">Brouillon</span>}</td>
                <td className="droite">
                  {m.statut === 'brouillon' && (
                    <div className="actions" style={{ justifyContent: 'flex-end' }}>
                      <button className="bouton succes petit" onClick={() => envoyerBrouillon(m.id)}>Envoyer</button>
                      <button className="bouton danger petit" onClick={() => supprimerBrouillon(m.id)}>Supprimer</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Rédaction : brouillon ou envoi direct ----------
function Composer({ onEnvoye, onErreur }) {
  const [contacts, setContacts] = useState([]);
  const [destinataire, setDestinataire] = useState('');
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');

  useEffect(() => {
    api.get('/messages/contacts').then((c) => { setContacts(c); if (c.length) setDestinataire(c[0].id); }).catch((e) => onErreur(e.message));
  }, []);

  async function creer(envoyer) {
    onErreur('');
    try {
      const { id } = await api.post('/messages', { destinataire_ids: [destinataire], objet, corps });
      if (envoyer) await api.post(`/messages/${id}/envoyer`, {});
      onEnvoye(envoyer ? 'Message envoyé.' : 'Brouillon enregistré.');
      setObjet(''); setCorps('');
    } catch (e) {
      onErreur(e.message);
    }
  }

  return (
    <div className="carte">
      <form onSubmit={(e) => { e.preventDefault(); creer(true); }}>
        <div className="champ">
          <label htmlFor="dest">Destinataire</label>
          <select id="dest" value={destinataire} onChange={(e) => setDestinataire(e.target.value)} required>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom} ({c.role})</option>)}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="objet">Objet</label>
          <input id="objet" value={objet} onChange={(e) => setObjet(e.target.value)} required />
        </div>
        <div className="champ">
          <label htmlFor="corps">Message</label>
          <textarea id="corps" value={corps} onChange={(e) => setCorps(e.target.value)} required />
        </div>
        <div className="actions">
          <button className="bouton" type="submit">Envoyer</button>
          <button className="bouton secondaire" type="button" onClick={() => creer(false)}>Enregistrer en brouillon</button>
        </div>
      </form>
    </div>
  );
}
