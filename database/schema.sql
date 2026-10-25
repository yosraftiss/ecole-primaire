-- =====================================================================
-- Gestion d'école primaire (mono-école) : modèle physique PostgreSQL
-- Auteur : Yosra Ftiss, groupe G03B
-- Date : 20 octobre 2026
-- Exécution : createdb ecole && psql -d ecole -v ON_ERROR_STOP=1 -f schema.sql
-- =====================================================================

BEGIN;

-- Extension nécessaire pour les contraintes EXCLUDE mêlant égalité et chevauchement
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- 1. Types énumérés
-- ---------------------------------------------------------------------
CREATE TYPE role_utilisateur    AS ENUM ('administrateur', 'enseignant', 'parent', 'eleve', 'secretariat');
CREATE TYPE lien_parent         AS ENUM ('pere', 'mere', 'tuteur');
CREATE TYPE statut_inscription  AS ENUM ('en_attente', 'validee', 'refusee');
CREATE TYPE type_evaluation     AS ENUM ('controle_continu', 'trimestriel');
CREATE TYPE mode_paiement       AS ENUM ('especes', 'virement', 'mobile_money');
CREATE TYPE statut_message      AS ENUM ('brouillon', 'envoye');
CREATE TYPE visibilite_annonce  AS ENUM ('tous', 'parents', 'enseignants');
CREATE TYPE statut_envoi        AS ENUM ('envoye', 'echec');
CREATE TYPE canal_envoi         AS ENUM ('interne', 'email', 'push');
CREATE TYPE action_audit        AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- Année scolaire : référence de l'historique (RM-11)
CREATE TABLE annee_scolaire (
    libelle     text PRIMARY KEY CHECK (libelle ~ '^[0-9]{4}-[0-9]{4}$'),
    date_debut  date NOT NULL,
    date_fin    date NOT NULL,
    CHECK (date_fin > date_debut)
);

-- Personnes et comptes
CREATE TABLE utilisateur (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    mot_de_passe  text NOT NULL,                  -- hash bcrypt ou argon2, jamais en clair
    role          role_utilisateur NOT NULL,
    nom           text NOT NULL,
    prenom        text NOT NULL,
    actif         boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz
);

CREATE TABLE parent (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id  uuid NOT NULL UNIQUE REFERENCES utilisateur(id),
    telephone       text,
    adresse         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

CREATE TABLE eleve (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id        uuid UNIQUE REFERENCES utilisateur(id),  -- compte élève, optionnel
    matricule             text NOT NULL UNIQUE,
    nom                   text NOT NULL,
    prenom                text NOT NULL,
    date_naissance        date NOT NULL,
    photo_url             text,
    antecedents_medicaux  text,                                    -- donnée sensible (RGPD)
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz
);

-- Liens familiaux : un parent peut avoir plusieurs enfants, un enfant plusieurs parents
CREATE TABLE parent_eleve (
    parent_id  uuid NOT NULL REFERENCES parent(id),
    eleve_id   uuid NOT NULL REFERENCES eleve(id),
    lien       lien_parent NOT NULL,
    PRIMARY KEY (parent_id, eleve_id)
);
CREATE INDEX parent_eleve_eleve_idx ON parent_eleve (eleve_id);

CREATE TABLE enseignant (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id  uuid NOT NULL UNIQUE REFERENCES utilisateur(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

-- Scolarité
CREATE TABLE classe (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    niveau                   text NOT NULL,
    section                  text NOT NULL DEFAULT '',
    capacite_max             integer NOT NULL CHECK (capacite_max > 0),
    enseignant_titulaire_id  uuid REFERENCES enseignant(id),
    annee_scolaire           text NOT NULL REFERENCES annee_scolaire(libelle),
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    deleted_at               timestamptz,
    CONSTRAINT classe_id_annee_uk UNIQUE (id, annee_scolaire)
);
CREATE UNIQUE INDEX classe_actif_uk ON classe (niveau, section, annee_scolaire) WHERE deleted_at IS NULL;

-- Inscription : une par élève et par année. Crée la demande, puis l'affectation à une classe.
CREATE TABLE inscription (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id         uuid NOT NULL REFERENCES eleve(id),
    annee_scolaire   text NOT NULL REFERENCES annee_scolaire(libelle),
    classe_id        uuid,                              -- NULL tant que l'élève n'est pas affecté
    statut           statut_inscription NOT NULL DEFAULT 'en_attente',
    date_demande     timestamptz NOT NULL DEFAULT now(),
    date_validation  timestamptz,
    valide_par_id    uuid REFERENCES utilisateur(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (eleve_id, annee_scolaire),
    -- La classe doit être de la même année que l'inscription (MATCH SIMPLE : ignoré si classe_id est NULL)
    FOREIGN KEY (classe_id, annee_scolaire) REFERENCES classe (id, annee_scolaire),
    CHECK (statut <> 'validee' OR date_validation IS NOT NULL)
);
CREATE INDEX inscription_classe_idx ON inscription (classe_id);

CREATE TABLE matiere (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nom             text NOT NULL,
    niveau          text NOT NULL,
    coefficient     numeric(4,2) NOT NULL CHECK (coefficient > 0),
    annee_scolaire  text NOT NULL REFERENCES annee_scolaire(libelle),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
CREATE UNIQUE INDEX matiere_actif_uk ON matiere (nom, niveau, annee_scolaire) WHERE deleted_at IS NULL;

-- Un enseignant peut enseigner plusieurs matières dans plusieurs classes
CREATE TABLE affectation (
    enseignant_id  uuid NOT NULL REFERENCES enseignant(id),
    matiere_id     uuid NOT NULL REFERENCES matiere(id),
    classe_id      uuid NOT NULL REFERENCES classe(id),
    PRIMARY KEY (enseignant_id, matiere_id, classe_id)
);

CREATE TABLE salle (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nom         text NOT NULL,
    capacite    integer NOT NULL CHECK (capacite > 0),
    disponible  boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);
CREATE UNIQUE INDEX salle_actif_uk ON salle (nom) WHERE deleted_at IS NULL;

-- Emploi du temps. Les heures sont stockées en minutes depuis minuit, ce qui permet un test de chevauchement.
CREATE TABLE creneau (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id       uuid NOT NULL,
    annee_scolaire  text NOT NULL REFERENCES annee_scolaire(libelle),
    matiere_id      uuid NOT NULL REFERENCES matiere(id),
    enseignant_id   uuid NOT NULL REFERENCES enseignant(id),
    salle_id        uuid REFERENCES salle(id),
    jour_semaine    smallint NOT NULL CHECK (jour_semaine BETWEEN 1 AND 6),   -- 1 = lundi
    debut_min       integer NOT NULL CHECK (debut_min BETWEEN 0 AND 1439),
    fin_min         integer NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    FOREIGN KEY (classe_id, annee_scolaire) REFERENCES classe (id, annee_scolaire),
    CHECK (fin_min > debut_min AND fin_min <= 1440),
    -- Détection des conflits (RM-05) : deux créneaux qui se chevauchent ne peuvent pas partager
    -- la même classe, le même enseignant ou la même salle, la même année et le même jour
    EXCLUDE USING gist (classe_id WITH =, annee_scolaire WITH =, jour_semaine WITH =,
                        int4range(debut_min, fin_min) WITH &&) WHERE (deleted_at IS NULL),
    EXCLUDE USING gist (enseignant_id WITH =, annee_scolaire WITH =, jour_semaine WITH =,
                        int4range(debut_min, fin_min) WITH &&) WHERE (deleted_at IS NULL),
    EXCLUDE USING gist (salle_id WITH =, annee_scolaire WITH =, jour_semaine WITH =,
                        int4range(debut_min, fin_min) WITH &&) WHERE (salle_id IS NOT NULL AND deleted_at IS NULL)
);
CREATE INDEX creneau_enseignant_idx ON creneau (enseignant_id);

-- Évaluations et notes
CREATE TABLE evaluation (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id        uuid NOT NULL REFERENCES classe(id),
    matiere_id       uuid NOT NULL REFERENCES matiere(id),
    annee_scolaire   text NOT NULL REFERENCES annee_scolaire(libelle),
    libelle          text NOT NULL,
    type             type_evaluation NOT NULL,
    trimestre        smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
    bareme           numeric(5,2) NOT NULL DEFAULT 20 CHECK (bareme > 0),
    date_evaluation  date NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz
);

CREATE TABLE note (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id  uuid NOT NULL REFERENCES evaluation(id),
    eleve_id       uuid NOT NULL REFERENCES eleve(id),
    valeur         numeric(5,2) NOT NULL CHECK (valeur >= 0),
    commentaire    text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (evaluation_id, eleve_id)
);
CREATE INDEX note_eleve_idx ON note (eleve_id);

-- Bulletin : résultat généré une fois par élève, par année et par trimestre
CREATE TABLE bulletin (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id          uuid NOT NULL REFERENCES eleve(id),
    classe_id         uuid NOT NULL REFERENCES classe(id),
    annee_scolaire    text NOT NULL REFERENCES annee_scolaire(libelle),
    trimestre         smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
    moyenne_generale  numeric(5,2) CHECK (moyenne_generale >= 0),
    fichier_url       text,
    genere_le         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (eleve_id, annee_scolaire, trimestre)
);

-- Suivi des absences (chapitre 7) : saisies par l'enseignant, justifiées par le parent
CREATE TABLE absence (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id         uuid NOT NULL REFERENCES eleve(id),
    annee_scolaire   text NOT NULL REFERENCES annee_scolaire(libelle),
    date_absence     date NOT NULL,
    justifiee        boolean NOT NULL DEFAULT false,
    justification    text,
    justifiee_par    uuid REFERENCES utilisateur(id),
    justifiee_le     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (eleve_id, date_absence),
    CHECK (NOT justifiee OR justification IS NOT NULL)
);
CREATE INDEX absence_eleve_idx ON absence (eleve_id);

-- Finances. Montants en dinar tunisien (TND), 3 décimales (millimes).
CREATE TABLE frais (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    annee_scolaire  text NOT NULL REFERENCES annee_scolaire(libelle),
    niveau          text NOT NULL,
    libelle         text NOT NULL,                          -- ex. Inscription, Scolarité, Tranche 1
    montant         numeric(12,3) NOT NULL CHECK (montant >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    UNIQUE (annee_scolaire, niveau, libelle)
);

CREATE TABLE paiement (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id        uuid NOT NULL REFERENCES eleve(id),
    annee_scolaire  text NOT NULL REFERENCES annee_scolaire(libelle),
    montant         numeric(12,3) NOT NULL CHECK (montant > 0),
    mode            mode_paiement NOT NULL,
    date_paiement   date NOT NULL,
    reference       text,
    recu_url        text,
    enregistre_par  uuid NOT NULL REFERENCES utilisateur(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
CREATE INDEX paiement_eleve_idx ON paiement (eleve_id, annee_scolaire);

-- Devoirs
CREATE TABLE devoir (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id       uuid NOT NULL REFERENCES classe(id),
    matiere_id      uuid NOT NULL REFERENCES matiere(id),
    enseignant_id   uuid NOT NULL REFERENCES enseignant(id),
    annee_scolaire  text NOT NULL REFERENCES annee_scolaire(libelle),
    titre           text NOT NULL,
    description     text,
    date_remise     timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

-- Dépôt : absence de ligne = « non rendu ». « Rendu » ou « en retard » se déduit de date_depot et date_remise.
CREATE TABLE depot (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    devoir_id    uuid NOT NULL REFERENCES devoir(id),
    eleve_id     uuid NOT NULL REFERENCES eleve(id),
    date_depot   timestamptz NOT NULL DEFAULT now(),
    note         numeric(5,2) CHECK (note >= 0),
    commentaire  text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (devoir_id, eleve_id)
);
CREATE INDEX depot_eleve_idx ON depot (eleve_id);

-- Marquage « vu » par les parents (chapitre 9.3)
CREATE TABLE consultation_devoir (
    devoir_id  uuid NOT NULL REFERENCES devoir(id),
    parent_id  uuid NOT NULL REFERENCES parent(id),
    eleve_id   uuid NOT NULL REFERENCES eleve(id),
    vu_le      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (devoir_id, parent_id, eleve_id)
);

-- Messagerie
CREATE TABLE message (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expediteur_id   uuid NOT NULL REFERENCES utilisateur(id),
    eleve_id        uuid REFERENCES eleve(id),              -- élève concerné : fil de discussion par élève
    objet           text NOT NULL,
    corps           text NOT NULL,
    statut          statut_message NOT NULL DEFAULT 'brouillon',
    created_at      timestamptz NOT NULL DEFAULT now(),
    envoye_le       timestamptz,
    CHECK ((statut = 'envoye') = (envoye_le IS NOT NULL))
);

-- Un message peut avoir plusieurs destinataires. Chacun peut masquer le message dans sa propre boîte.
CREATE TABLE message_destinataire (
    message_id       uuid NOT NULL REFERENCES message(id),
    destinataire_id  uuid NOT NULL REFERENCES utilisateur(id),
    masque           boolean NOT NULL DEFAULT false,
    lu_le            timestamptz,
    PRIMARY KEY (message_id, destinataire_id)
);
CREATE INDEX message_destinataire_user_idx ON message_destinataire (destinataire_id);

CREATE TABLE annonce (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auteur_id    uuid NOT NULL REFERENCES utilisateur(id),
    titre        text NOT NULL,
    corps        text NOT NULL,
    visibilite   visibilite_annonce NOT NULL DEFAULT 'tous',
    publiee_le   timestamptz NOT NULL DEFAULT now()
);

-- Journal des consultations d'un message (chapitre 10.5)
CREATE TABLE acces_historique (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_id      uuid NOT NULL REFERENCES message(id),
    utilisateur_id  uuid NOT NULL REFERENCES utilisateur(id),
    date_acces      timestamptz NOT NULL DEFAULT now()
);

-- Journal des envois : messages automatiques après paiement (RM-10) et relances des impayés
CREATE TABLE journal_envoi (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paiement_id      uuid REFERENCES paiement(id),
    message_id       uuid REFERENCES message(id),
    destinataire_id  uuid NOT NULL REFERENCES utilisateur(id),
    canal            canal_envoi NOT NULL,
    statut           statut_envoi NOT NULL,
    date_envoi       timestamptz NOT NULL DEFAULT now(),
    CHECK (paiement_id IS NOT NULL OR message_id IS NOT NULL)
);

-- Journal d'audit des modifications (chapitre 3)
CREATE TABLE audit_log (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name         text NOT NULL,
    record_id          text,                                -- NULL si la table n'a pas de colonne id
    action             action_audit NOT NULL,
    utilisateur_id     uuid,
    date_action        timestamptz NOT NULL DEFAULT now(),
    anciennes_valeurs  jsonb,
    nouvelles_valeurs  jsonb
);
CREATE INDEX audit_log_table_idx ON audit_log (table_name, record_id);

-- ---------------------------------------------------------------------
-- 3. Fonctions de trigger
-- ---------------------------------------------------------------------

-- Refuse toute modification : table en lecture seule
CREATE FUNCTION interdire_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % en lecture seule : % interdit', TG_TABLE_NAME, TG_OP;
END;
$$;

-- Un message envoyé ne peut être ni modifié ni supprimé par son expéditeur (RM-06)
CREATE FUNCTION proteger_message_envoye() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut = 'envoye' THEN
    RAISE EXCEPTION 'Ce message a été envoyé : il ne peut plus être modifié ni supprimé';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Une note ne peut pas dépasser le barème de l'évaluation (contrôle de la saisie)
CREATE FUNCTION verifier_note_bareme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.valeur > (SELECT bareme FROM evaluation WHERE id = NEW.evaluation_id) THEN
    RAISE EXCEPTION 'La note dépasse le barème de cette évaluation';
  END IF;
  RETURN NEW;
END;
$$;

-- Après la date de remise, le travail ne peut plus être remplacé (RM-04).
-- Un dépôt tardif reste possible ; la note et le commentaire restent modifiables.
CREATE FUNCTION bloquer_depot_apres_remise() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.date_depot IS DISTINCT FROM OLD.date_depot
     AND now() > (SELECT date_remise FROM devoir WHERE id = OLD.devoir_id) THEN
    RAISE EXCEPTION 'Le dépôt ne peut plus être remplacé après la date de remise';
  END IF;
  RETURN NEW;
END;
$$;

-- Met à jour updated_at à chaque modification
CREATE FUNCTION maj_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Journalise les modifications : anciennes et nouvelles valeurs, utilisateur, date
-- L'application indique l'utilisateur courant par : SET LOCAL app.utilisateur_id = '<uuid>';
CREATE FUNCTION journaliser_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, utilisateur_id, anciennes_valeurs, nouvelles_valeurs)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(to_jsonb(NEW) ->> 'id', to_jsonb(OLD) ->> 'id'),
    TG_OP::action_audit,
    NULLIF(current_setting('app.utilisateur_id', true), '')::uuid,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------

CREATE TRIGGER message_immuable
  BEFORE UPDATE OR DELETE ON message
  FOR EACH ROW EXECUTE FUNCTION proteger_message_envoye();

CREATE TRIGGER annonce_immuable
  BEFORE UPDATE OR DELETE ON annonce
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

CREATE TRIGGER acces_lecture_seule
  BEFORE UPDATE OR DELETE ON acces_historique
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

CREATE TRIGGER audit_lecture_seule
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

CREATE TRIGGER note_bareme
  BEFORE INSERT OR UPDATE ON note
  FOR EACH ROW EXECUTE FUNCTION verifier_note_bareme();

CREATE TRIGGER depot_delai
  BEFORE UPDATE ON depot
  FOR EACH ROW EXECUTE FUNCTION bloquer_depot_apres_remise();

-- Triggers « updated_at » et « audit » sur toutes les tables métier
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['utilisateur', 'parent', 'eleve', 'enseignant', 'classe', 'inscription',
                           'matiere', 'salle', 'creneau', 'evaluation', 'note', 'paiement', 'absence',
                           'frais', 'devoir', 'depot'] LOOP
    EXECUTE format('CREATE TRIGGER maj_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION maj_updated_at()', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION journaliser_modification()', t, t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Vue : solde de chaque élève (solde_restant > 0 = somme due)
-- ---------------------------------------------------------------------
CREATE VIEW solde AS
WITH du AS (
  SELECT i.eleve_id, i.annee_scolaire, SUM(f.montant) AS total_du
  FROM inscription i
  JOIN classe c ON c.id = i.classe_id
  JOIN frais f  ON f.annee_scolaire = i.annee_scolaire AND f.niveau = c.niveau AND f.deleted_at IS NULL
  WHERE i.statut = 'validee'
  GROUP BY i.eleve_id, i.annee_scolaire
), paye AS (
  SELECT eleve_id, annee_scolaire, SUM(montant) AS total_paye
  FROM paiement
  WHERE deleted_at IS NULL
  GROUP BY eleve_id, annee_scolaire
)
SELECT du.eleve_id,
       du.annee_scolaire,
       du.total_du,
       COALESCE(paye.total_paye, 0)                       AS total_paye,
       du.total_du - COALESCE(paye.total_paye, 0)         AS solde_restant
FROM du
LEFT JOIN paye USING (eleve_id, annee_scolaire);

-- ---------------------------------------------------------------------
-- 6. Données d'exemple (à remplacer par les vraies dates de l'école)
-- ---------------------------------------------------------------------
INSERT INTO annee_scolaire (libelle, date_debut, date_fin)
VALUES ('2026-2027', '2026-09-15', '2027-06-30');

COMMIT;
