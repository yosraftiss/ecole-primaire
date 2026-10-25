// Évaluations, saisie des notes, moyennes et bulletins (CU « Notes et bulletins »).
// Moyenne d'une matière : on ramène chaque note sur 20, puis on fait la moyenne du trimestre.
// Moyenne générale : moyenne des matières pondérée par leurs coefficients.
import { Router } from 'express';
import fs from 'node:fs';
import { query, transaction } from '../db.js';
import { requireAuth, requireRole, asyncRoute, HttpError } from '../auth.js';
import { peutVoirEleve } from '../acces.js';
import { cheminStockage, genererBulletinPdf } from '../pdf.js';

const router = Router();
const gestion = ['administrateur', 'secretariat'];

// Un enseignant ne peut noter que les matières qui lui sont affectées dans la classe
async function peutGererNotes(user, classeId, matiereId) {
  if (gestion.includes(user.role)) return true;
  if (user.role !== 'enseignant') return false;
  const { rows } = await query(
    `SELECT 1 FROM affectation a
       JOIN enseignant en ON en.id = a.enseignant_id
      WHERE en.utilisateur_id = $1 AND a.classe_id = $2 AND a.matiere_id = $3`,
    [user.id, classeId, matiereId]
  );
  return rows.length > 0;
}

// Liste des évaluations d'une classe
router.get('/evaluations', requireAuth, asyncRoute(async (req, res) => {
  const { classe_id, matiere_id, trimestre, annee = '2026-2027' } = req.query;
  if (!classe_id) throw new HttpError(400, 'Choisissez la classe');
  const { rows } = await query(
    `SELECT ev.*, m.nom AS matiere
       FROM evaluation ev JOIN matiere m ON m.id = ev.matiere_id
      WHERE ev.classe_id = $1 AND ev.annee_scolaire = $2 AND ev.deleted_at IS NULL
        AND ($3::uuid IS NULL OR ev.matiere_id = $3)
        AND ($4::int IS NULL OR ev.trimestre = $4)
      ORDER BY ev.date_evaluation DESC`,
    [classe_id, annee, matiere_id || null, trimestre ? Number(trimestre) : null]
  );
  res.json(rows);
}));

// Création d'une évaluation (contrôle, examen…)
router.post('/evaluations', requireAuth, asyncRoute(async (req, res) => {
  const { classe_id, matiere_id, annee_scolaire = '2026-2027', libelle, type, trimestre, bareme = 20, date_evaluation } = req.body || {};
  if (!classe_id || !matiere_id || !libelle || !type || !trimestre || !date_evaluation) {
    throw new HttpError(400, 'Classe, matière, libellé, type, trimestre et date obligatoires');
  }
  if (!(await peutGererNotes(req.user, classe_id, matiere_id))) {
    throw new HttpError(403, "Cette matière ne vous est pas affectée dans cette classe");
  }
  const { rows } = await transaction(req.user.id, (c) => c.query(
    `INSERT INTO evaluation (classe_id, matiere_id, annee_scolaire, libelle, type, trimestre, bareme, date_evaluation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [classe_id, matiere_id, annee_scolaire, libelle, type, trimestre, bareme, date_evaluation]
  ));
  res.status(201).json(rows[0]);
}));

// Feuille de notes : tous les élèves de la classe avec leur note (vide si pas encore saisie)
router.get('/evaluations/:id/notes', requireAuth, asyncRoute(async (req, res) => {
  const ev = await query('SELECT * FROM evaluation WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!ev.rows[0]) throw new HttpError(404, 'Évaluation introuvable');
  const evaluation = ev.rows[0];
  if (!(await peutGererNotes(req.user, evaluation.classe_id, evaluation.matiere_id))) {
    throw new HttpError(403, 'Accès refusé à cette évaluation');
  }
  const { rows } = await query(
    `SELECT e.id AS eleve_id, e.matricule, e.nom, e.prenom, n.valeur, n.commentaire
       FROM inscription i
       JOIN eleve e ON e.id = i.eleve_id
       LEFT JOIN note n ON n.eleve_id = e.id AND n.evaluation_id = $1
      WHERE i.classe_id = $2 AND i.statut = 'validee'
      ORDER BY e.nom, e.prenom`,
    [req.params.id, evaluation.classe_id]
  );
  res.json({ evaluation, notes: rows });
}));

// Enregistrement de toutes les notes d'un coup (saisie par lot)
// Corps : { notes: [ { eleve_id, valeur, commentaire } ] }. Une note vide est ignorée.
router.put('/evaluations/:id/notes', requireAuth, asyncRoute(async (req, res) => {
  const ev = await query('SELECT classe_id, matiere_id FROM evaluation WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!ev.rows[0]) throw new HttpError(404, 'Évaluation introuvable');
  if (!(await peutGererNotes(req.user, ev.rows[0].classe_id, ev.rows[0].matiere_id))) {
    throw new HttpError(403, 'Vous ne pouvez pas saisir les notes de cette matière');
  }
  const liste = (req.body && req.body.notes) || [];
  if (!Array.isArray(liste)) throw new HttpError(400, 'Format des notes invalide');

  const enregistrees = await transaction(req.user.id, async (c) => {
    let compte = 0;
    for (const n of liste) {
      if (n.valeur === '' || n.valeur === null || n.valeur === undefined) continue;
      const valeur = Number(String(n.valeur).replace(',', '.'));
      if (Number.isNaN(valeur) || valeur < 0) {
        throw new HttpError(400, `Note invalide pour un élève : « ${n.valeur} »`);
      }
      // L'élève doit être inscrit dans la classe de l'évaluation.
      // Le trigger de la base refuse une note au-dessus du barème.
      const r = await c.query(
        `INSERT INTO note (evaluation_id, eleve_id, valeur, commentaire)
         SELECT $1::uuid, $2::uuid, $3::numeric, $4::text
          WHERE EXISTS (SELECT 1 FROM inscription i
                         WHERE i.eleve_id = $2::uuid AND i.classe_id = $5::uuid AND i.statut = 'validee')
         ON CONFLICT (evaluation_id, eleve_id)
         DO UPDATE SET valeur = EXCLUDED.valeur, commentaire = EXCLUDED.commentaire`,
        [req.params.id, n.eleve_id, valeur, n.commentaire || null, ev.rows[0].classe_id]
      );
      if (r.rowCount === 0) throw new HttpError(400, "Un élève n'est pas inscrit dans cette classe");
      compte += 1;
    }
    return compte;
  });
  res.json({ enregistrees });
}));

// Moyennes de la classe pour un trimestre (une ligne par élève)
async function calculerMoyennes(classeId, annee, trimestre) {
  const eleves = await query(
    `SELECT e.id, e.matricule, e.nom, e.prenom
       FROM inscription i JOIN eleve e ON e.id = i.eleve_id
      WHERE i.classe_id = $1 AND i.statut = 'validee' AND e.deleted_at IS NULL
      ORDER BY e.nom, e.prenom`,
    [classeId]
  );
  // Moyenne de chaque matière pour chaque élève (notes ramenées sur 20)
  const lignes = await query(
    `SELECT n.eleve_id, m.id AS matiere_id, m.nom AS matiere, m.coefficient,
            AVG(n.valeur * 20 / ev.bareme)::float8 AS moyenne
       FROM note n
       JOIN evaluation ev ON ev.id = n.evaluation_id
       JOIN matiere m ON m.id = ev.matiere_id
      WHERE ev.classe_id = $1 AND ev.annee_scolaire = $2 AND ev.trimestre = $3 AND ev.deleted_at IS NULL
      GROUP BY n.eleve_id, m.id, m.nom, m.coefficient
      ORDER BY m.nom`,
    [classeId, annee, trimestre]
  );

  return eleves.rows.map((e) => {
    const matieres = lignes.rows.filter((l) => l.eleve_id === e.id);
    const totalPondere = matieres.reduce((somme, l) => somme + l.moyenne * Number(l.coefficient), 0);
    const totalCoef = matieres.reduce((somme, l) => somme + Number(l.coefficient), 0);
    return {
      eleve_id: e.id,
      matricule: e.matricule,
      nom: e.nom,
      prenom: e.prenom,
      matieres: matieres.map((l) => ({ matiere: l.matiere, coefficient: Number(l.coefficient), moyenne: round2(l.moyenne) })),
      moyenne_generale: totalCoef > 0 ? round2(totalPondere / totalCoef) : null,
    };
  });
}

function round2(valeur) {
  return Math.round(valeur * 100) / 100;
}

router.get('/classes/:id/moyennes', ...[requireAuth, requireRole(...gestion, 'enseignant')], asyncRoute(async (req, res) => {
  const annee = req.query.annee || '2026-2027';
  const trimestre = Number(req.query.trimestre || 1);
  res.json(await calculerMoyennes(req.params.id, annee, trimestre));
}));

// Génération des bulletins PDF d'une classe pour un trimestre
router.post('/classes/:id/bulletins', requireAuth, requireRole(...gestion), asyncRoute(async (req, res) => {
  const annee = req.body?.annee || '2026-2027';
  const trimestre = Number(req.body?.trimestre || 1);
  const classe = await query(
    `SELECT c.*, c.niveau || ' ' || c.section AS nom FROM classe c WHERE c.id = $1 AND c.deleted_at IS NULL`, [req.params.id]
  );
  if (!classe.rows[0]) throw new HttpError(404, 'Classe introuvable');
  const moyennes = await calculerMoyennes(req.params.id, annee, trimestre);

  const crees = [];
  for (const m of moyennes) {
    const nomFichier = `bulletin-${m.matricule}-${annee}-T${trimestre}.pdf`;
    await genererBulletinPdf(cheminStockage('bulletins', nomFichier), {
      annee,
      trimestre,
      nomEleve: `${m.prenom} ${m.nom}`,
      matricule: m.matricule,
      classe: classe.rows[0].nom,
      lignes: m.matieres.map((x) => ({ matiere: x.matiere, coefficient: x.coefficient, moyenne: x.moyenne })),
      moyenneGenerale: m.moyenne_generale,
    });
    await transaction(req.user.id, (c) => c.query(
      `INSERT INTO bulletin (eleve_id, classe_id, annee_scolaire, trimestre, moyenne_generale, fichier_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (eleve_id, annee_scolaire, trimestre)
       DO UPDATE SET moyenne_generale = EXCLUDED.moyenne_generale, fichier_url = EXCLUDED.fichier_url, genere_le = now()`,
      [m.eleve_id, req.params.id, annee, trimestre, m.moyenne_generale, nomFichier]
    ));
    crees.push({ eleve_id: m.eleve_id, moyenne_generale: m.moyenne_generale });
  }
  res.status(201).json({ bulletins: crees.length, detail: crees });
}));

// Bulletins d'un élève (parent, enseignant de la classe ou secrétariat)
router.get('/eleves/:id/bulletins', requireAuth, asyncRoute(async (req, res) => {
  if (!(await peutVoirEleve(req.user, req.params.id))) throw new HttpError(403, 'Accès refusé');
  const { rows } = await query(
    'SELECT id, trimestre, annee_scolaire, moyenne_generale, genere_le FROM bulletin WHERE eleve_id = $1 ORDER BY annee_scolaire, trimestre',
    [req.params.id]
  );
  res.json(rows);
}));

// Téléchargement du PDF d'un bulletin (contrôle d'accès)
router.get('/bulletins/:id/pdf', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query('SELECT eleve_id, fichier_url FROM bulletin WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Bulletin introuvable');
  if (!(await peutVoirEleve(req.user, rows[0].eleve_id))) throw new HttpError(403, 'Accès refusé');
  const chemin = cheminStockage('bulletins', rows[0].fichier_url);
  if (!fs.existsSync(chemin)) throw new HttpError(404, 'Fichier du bulletin absent');
  res.sendFile(chemin);
}));

export default router;
