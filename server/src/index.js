// Point d'entrée du serveur : charge la configuration et branche les routes.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { gestionErreurs } from './auth.js';
import authRoutes from './routes/auth.js';
import referentielRoutes from './routes/referentiel.js';
import inscriptionRoutes from './routes/inscriptions.js';
import notesRoutes from './routes/notes.js';
import financesRoutes from './routes/finances.js';
import pedagogieRoutes from './routes/pedagogie.js';
import messagerieRoutes from './routes/messagerie.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/sante', (req, res) => res.json({ ok: true, application: 'Gestion école primaire' }));

app.use('/api/auth', authRoutes);
app.use('/api', referentielRoutes);     // classes, matières, salles, enseignants, élèves, parents, années
app.use('/api', inscriptionRoutes);    // inscriptions et affectation aux classes
app.use('/api', notesRoutes);          // évaluations, notes, moyennes, bulletins
app.use('/api', financesRoutes);       // frais, paiements, reçus, impayés, relances
app.use('/api', pedagogieRoutes);      // emploi du temps, absences, devoirs, annonces
app.use('/api', messagerieRoutes);     // messages, brouillons, envois, historique

app.use((req, res) => res.status(404).json({ erreur: 'Adresse introuvable' }));
app.use(gestionErreurs);

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Serveur démarré : http://localhost:${port}`);
});
