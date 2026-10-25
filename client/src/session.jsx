// Session : mémorise l'utilisateur connecté et fournit « connexion » et « déconnexion » à toute l'application.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, enregistrerJeton, lireJeton } from './api.js';

const ContexteSession = createContext(null);

export function SessionProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);

  // Au démarrage : si un jeton existe encore, on récupère l'utilisateur
  useEffect(() => {
    if (!lireJeton()) {
      setChargement(false);
      return;
    }
    api.get('/auth/moi')
      .then((d) => setUtilisateur(d.utilisateur))
      .catch(() => enregistrerJeton(null))
      .finally(() => setChargement(false));
  }, []);

  // Si le serveur répond « session expirée », on déconnecte
  useEffect(() => {
    const expiree = () => setUtilisateur(null);
    window.addEventListener('session-expiree', expiree);
    return () => window.removeEventListener('session-expiree', expiree);
  }, []);

  const connexion = useCallback(async (email, motDePasse) => {
    const d = await api.post('/auth/connexion', { email, motDePasse });
    enregistrerJeton(d.jeton);
    setUtilisateur(d.utilisateur);
  }, []);

  const deconnexion = useCallback(() => {
    enregistrerJeton(null);
    setUtilisateur(null);
  }, []);

  return (
    <ContexteSession.Provider value={{ utilisateur, chargement, connexion, deconnexion }}>
      {children}
    </ContexteSession.Provider>
  );
}

export function useSession() {
  return useContext(ContexteSession);
}
