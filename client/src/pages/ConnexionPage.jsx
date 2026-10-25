// Page d'entrée : le héro TOONHUB en plein écran.
// Le lien « DISCOVER IT » ouvre le panneau de connexion (email + mot de passe).
import { useState } from 'react';
import { useSession } from '../session.jsx';
import Hero from '../components/Hero.jsx';

export default function ConnexionPage() {
  const { connexion } = useSession();
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      await connexion(email, motDePasse);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="page-connexion">
      <Hero onDecouvrir={() => setPanneauOuvert(true)} />

      {panneauOuvert && (
        <>
          <form className="boite-connexion" onSubmit={soumettre}>
            <button type="button" className="fermer-connexion" aria-label="Fermer" onClick={() => setPanneauOuvert(false)}>
              ×
            </button>
            <div className="logo">ÉP</div>
            <h1>Connexion</h1>
            <p className="doux">Espace de l'école primaire</p>

            {erreur && <div className="alerte erreur">{erreur}</div>}

            <div className="champ">
              <label htmlFor="email">Adresse email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="champ">
              <label htmlFor="mdp">Mot de passe</label>
              <input id="mdp" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
            </div>
            <button className="bouton" type="submit" disabled={envoi} style={{ width: '100%' }}>
              {envoi ? 'Connexion…' : 'Se connecter'}
            </button>
            <p className="doux" style={{ marginTop: 16 }}>
              Compte de démonstration : admin@ecole.tn — mot de passe demo1234
            </p>
          </form>
        </>
      )}
    </div>
  );
}
