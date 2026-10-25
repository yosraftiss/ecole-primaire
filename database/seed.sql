-- =====================================================================
-- Données de démonstration (à charger après schema.sql)
-- Tous les comptes de démonstration ont le mot de passe : demo1234
-- Le script scripts/init-db.js remplace __HASH_DEMO__ par le hash du mot de passe.
-- =====================================================================

BEGIN;

-- Comptes (administrateur, secrétariat, 2 enseignants, 2 parents)
INSERT INTO utilisateur (id, email, mot_de_passe, role, nom, prenom) VALUES
 ('00000000-0000-4000-8000-000000000001', 'admin@ecole.tn',        '__HASH_DEMO__', 'administrateur', 'Gharbi',  'Mounir'),
 ('00000000-0000-4000-8000-000000000002', 'secretariat@ecole.tn',  '__HASH_DEMO__', 'secretariat',    'Jebali',  'Amel'),
 ('00000000-0000-4000-8000-000000000011', 'enseignant1@ecole.tn',  '__HASH_DEMO__', 'enseignant',     'Ben Ali', 'Fatma'),
 ('00000000-0000-4000-8000-000000000012', 'enseignant2@ecole.tn',  '__HASH_DEMO__', 'enseignant',     'Hammami', 'Karim'),
 ('00000000-0000-4000-8000-000000000021', 'parent1@exemple.tn',    '__HASH_DEMO__', 'parent',         'Salah',   'Nabil'),
 ('00000000-0000-4000-8000-000000000022', 'parent2@exemple.tn',    '__HASH_DEMO__', 'parent',         'Karray',  'Leila');

INSERT INTO enseignant (id, utilisateur_id) VALUES
 ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000011'),
 ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000012');

INSERT INTO parent (id, utilisateur_id, telephone, adresse) VALUES
 ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000021', '+216 20 000 001', 'Sousse'),
 ('00000000-0000-4000-8000-000000000222', '00000000-0000-4000-8000-000000000022', '+216 20 000 002', 'Sousse');

-- Classes, salles, matières (année 2026-2027 créée par schema.sql)
INSERT INTO classe (id, niveau, section, capacite_max, enseignant_titulaire_id, annee_scolaire) VALUES
 ('00000000-0000-4000-8000-000000000401', 'CP',  'A', 25, '00000000-0000-4000-8000-000000000311', '2026-2027'),
 ('00000000-0000-4000-8000-000000000402', 'CP',  'B', 25, '00000000-0000-4000-8000-000000000312', '2026-2027');

INSERT INTO salle (id, nom, capacite) VALUES
 ('00000000-0000-4000-8000-000000000501', 'Salle 1',             30),
 ('00000000-0000-4000-8000-000000000502', 'Salle informatique',  20);

INSERT INTO matiere (id, nom, niveau, coefficient, annee_scolaire) VALUES
 ('00000000-0000-4000-8000-000000000601', 'Arabe',       'CP', 5, '2026-2027'),
 ('00000000-0000-4000-8000-000000000602', 'Français',    'CP', 4, '2026-2027'),
 ('00000000-0000-4000-8000-000000000603', 'Mathématiques','CP', 4, '2026-2027'),
 ('00000000-0000-4000-8000-000000000604', 'Éveil',       'CP', 2, '2026-2027');

-- Qui enseigne quoi
INSERT INTO affectation (enseignant_id, matiere_id, classe_id) VALUES
 ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000401'),
 ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000401'),
 ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000402'),
 ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000402'),
 ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000401'),
 ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000401');

-- Élèves et liens avec les parents
INSERT INTO eleve (id, matricule, nom, prenom, date_naissance) VALUES
 ('00000000-0000-4000-8000-000000000701', 'M001', 'Salah',  'Youssef', '2019-03-14'),
 ('00000000-0000-4000-8000-000000000702', 'M002', 'Salah',  'Sana',    '2020-07-02'),
 ('00000000-0000-4000-8000-000000000703', 'M003', 'Karray', 'Adam',    '2019-11-21');

INSERT INTO parent_eleve (parent_id, eleve_id, lien) VALUES
 ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000701', 'pere'),
 ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000702', 'pere'),
 ('00000000-0000-4000-8000-000000000222', '00000000-0000-4000-8000-000000000703', 'mere');

-- Inscriptions : deux validées (avec classe), une en attente (pour tester la validation)
INSERT INTO inscription (eleve_id, annee_scolaire, classe_id, statut, date_validation, valide_par_id) VALUES
 ('00000000-0000-4000-8000-000000000701', '2026-2027', '00000000-0000-4000-8000-000000000401', 'validee', '2026-09-10', '00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000703', '2026-2027', '00000000-0000-4000-8000-000000000402', 'validee', '2026-09-10', '00000000-0000-4000-8000-000000000002');
INSERT INTO inscription (eleve_id, annee_scolaire) VALUES
 ('00000000-0000-4000-8000-000000000702', '2026-2027');

-- Frais de scolarité pour le niveau CP (TND, 3 décimales)
INSERT INTO frais (annee_scolaire, niveau, libelle, montant) VALUES
 ('2026-2027', 'CP', 'Inscription',          50.000),
 ('2026-2027', 'CP', 'Scolarité tranche 1', 300.000),
 ('2026-2027', 'CP', 'Scolarité tranche 2', 200.000);

-- Créneaux : emploi du temps (jour 1 = lundi, heures en minutes depuis minuit)
INSERT INTO creneau (classe_id, annee_scolaire, matiere_id, enseignant_id, salle_id, jour_semaine, debut_min, fin_min) VALUES
 ('00000000-0000-4000-8000-000000000401', '2026-2027', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000501', 1, 480, 540),   -- Lundi 08:00-09:00
 ('00000000-0000-4000-8000-000000000401', '2026-2027', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000501', 1, 540, 600),   -- Lundi 09:00-10:00
 ('00000000-0000-4000-8000-000000000402', '2026-2027', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000501', 2, 480, 540);   -- Mardi 08:00-09:00

-- Une évaluation avec des notes (pour tester les moyennes et les bulletins)
INSERT INTO evaluation (id, classe_id, matiere_id, annee_scolaire, libelle, type, trimestre, bareme, date_evaluation) VALUES
 ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000601', '2026-2027', 'Dictée n°1',  'controle_continu', 1, 10, '2026-10-05'),
 ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000603', '2026-2027', 'Calcul mental', 'controle_continu', 1, 20, '2026-10-06');

INSERT INTO note (evaluation_id, eleve_id, valeur, commentaire) VALUES
 ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000701', 8.5, 'Bon travail'),
 ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000701', 14, NULL);

-- Un devoir à rendre et une absence (pour tester le suivi)
INSERT INTO devoir (id, classe_id, matiere_id, enseignant_id, annee_scolaire, titre, description, date_remise) VALUES
 ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000311', '2026-2027', 'Lire le texte page 12', 'Lire deux fois et répondre aux questions orales.', '2026-11-05 08:00:00+01');

INSERT INTO absence (eleve_id, annee_scolaire, date_absence) VALUES
 ('00000000-0000-4000-8000-000000000701', '2026-2027', '2026-10-12');

-- Annonces et un message déjà envoyé (démonstration)
INSERT INTO annonce (auteur_id, titre, corps, visibilite) VALUES
 ('00000000-0000-4000-8000-000000000001', 'Rentrée scolaire', 'La rentrée a lieu le 15 septembre. Bonne année à tous !', 'tous'),
 ('00000000-0000-4000-8000-000000000001', 'Réunion des parents', 'Réunion des parents de CP jeudi à 17 h, salle 1.', 'parents');

INSERT INTO message (id, expediteur_id, eleve_id, objet, corps, statut, envoye_le) VALUES
 ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000701',
  'Dictée de Youssef', 'Bonjour, Youssef a obtenu 8,5 / 10 à la dictée. Bon travail.', 'envoye', '2026-10-06 10:00:00+01');
INSERT INTO message_destinataire (message_id, destinataire_id) VALUES
 ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000021');

COMMIT;
