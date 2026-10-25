// Structure de l'application : menu selon le rôle de l'utilisateur, et les pages.
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useSession } from './session.jsx';
import { ROLES } from './api.js';
import ConnexionPage from './pages/ConnexionPage.jsx';
import AccueilPage from './pages/AccueilPage.jsx';
import ElevesPage from './pages/ElevesPage.jsx';
import InscriptionsPage from './pages/InscriptionsPage.jsx';
import ClassesPage from './pages/ClassesPage.jsx';
import NotesPage from './pages/NotesPage.jsx';
import FinancesPage from './pages/FinancesPage.jsx';
import EmploiDuTempsPage from './pages/EmploiDuTempsPage.jsx';
import AbsencesPage from './pages/AbsencesPage.jsx';
import DevoirsPage from './pages/DevoirsPage.jsx';
import MessageriePage from './pages/MessageriePage.jsx';

const GESTION = ['administrateur', 'secretariat'];

// Chaque entrée du menu indique les rôles qui la voient
const MENU = [
  { chemin: '/', libelle: 'Accueil', roles: ['administrateur', 'secretariat', 'enseignant', 'parent', 'eleve'] },
  { chemin: '/eleves', libelle: 'Élèves', roles: ['administrateur', 'secretariat', 'enseignant', 'parent', 'eleve'] },
  { chemin: '/inscriptions', libelle: 'Inscriptions', roles: [...GESTION, 'parent'] },
  { chemin: '/classes', libelle: 'Classes et matières', roles: [...GESTION, 'enseignant'] },
  { chemin: '/emploi-du-temps', libelle: 'Emploi du temps', roles: ['administrateur', 'secretariat', 'enseignant', 'parent', 'eleve'] },
  { chemin: '/notes', libelle: 'Notes et bulletins', roles: [...GESTION, 'enseignant'] },
  { chemin: '/absences', libelle: 'Absences', roles: [...GESTION, 'enseignant', 'parent'] },
  { chemin: '/devoirs', libelle: 'Devoirs', roles: [...GESTION, 'enseignant', 'parent'] },
  { chemin: '/finances', libelle: 'Paiements', roles: [...GESTION, 'parent'] },
  { chemin: '/messagerie', libelle: 'Messagerie', roles: ['administrateur', 'secretariat', 'enseignant', 'parent', 'eleve'] },
];

export default function App() {
  const { utilisateur, chargement, deconnexion } = useSession();

  if (chargement) return <div className="vide">Chargement…</div>;
  if (!utilisateur) return <ConnexionPage />;

  const elements = MENU.filter((m) => m.roles.includes(utilisateur.role));

  return (
    <div className="app">
      <nav className="menu">
        <div className="marque">École primaire</div>
        {elements.map((m) => (
          <NavLink key={m.chemin} to={m.chemin} end={m.chemin === '/'} className={({ isActive }) => (isActive ? 'actif' : '')}>
            {m.libelle}
          </NavLink>
        ))}
        <div className="pied">
          {utilisateur.prenom} {utilisateur.nom}<br />
          <small>{ROLES[utilisateur.role]}</small>
          <br />
          <button className="bouton secondaire petit" style={{ marginTop: 8 }} onClick={deconnexion}>
            Se déconnecter
          </button>
        </div>
      </nav>

      <main className="contenu">
        <Routes>
          <Route path="/" element={<AccueilPage />} />
          <Route path="/eleves" element={<ElevesPage />} />
          <Route path="/inscriptions" element={<InscriptionsPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/emploi-du-temps" element={<EmploiDuTempsPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/absences" element={<AbsencesPage />} />
          <Route path="/devoirs" element={<DevoirsPage />} />
          <Route path="/finances" element={<FinancesPage />} />
          <Route path="/messagerie" element={<MessageriePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
