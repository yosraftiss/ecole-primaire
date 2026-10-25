// Tests automatiques de l'API (parcours principaux).
// Le serveur doit être démarré (npm start) et la base initialisée (npm run init-db).
// Utilisation : npm run test-api
const BASE = process.env.API_URL || 'http://localhost:3001/api';
const suffixe = Date.now().toString().slice(-6); // pour créer des données uniques à chaque test

let reussis = 0;
let echoues = 0;

async function appel(methode, chemin, { jeton, corps } = {}) {
  const reponse = await fetch(BASE + chemin, {
    method: methode,
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const type = reponse.headers.get('content-type') || '';
  const donnees = type.includes('json') ? await reponse.json() : await reponse.arrayBuffer();
  return { statut: reponse.status, donnees, type };
}

function verifier(libelle, condition, detail = '') {
  if (condition) {
    reussis += 1;
    console.log(`  OK    ${libelle}`);
  } else {
    echoues += 1;
    console.log(`  ECHEC ${libelle} ${detail}`);
  }
}

async function connexion(email) {
  const r = await appel('POST', '/auth/connexion', { corps: { email, motDePasse: 'demo1234' } });
  return r.donnees.jeton;
}

async function main() {
  console.log('Connexion des comptes');
  const admin = await connexion('admin@ecole.tn');
  const ens = await connexion('enseignant1@ecole.tn');
  const parent1 = await connexion('parent1@exemple.tn');
  const parent2 = await connexion('parent2@exemple.tn');
  verifier('Connexion administrateur', !!admin);
  verifier('Mauvais mot de passe refusé', (await appel('POST', '/auth/connexion', { corps: { email: 'admin@ecole.tn', motDePasse: 'faux' } })).statut === 401);

  console.log('\nDroits d\'accès');
  verifier('Parent ne peut pas créer une classe', (await appel('POST', '/classes', { jeton: parent1, corps: { niveau: 'CE1', capacite_max: 20, annee_scolaire: '2026-2027' } })).statut === 403);
  const eleves = (await appel('GET', '/eleves?annee=2026-2027', { jeton: admin })).donnees;
  const youssef = eleves.find((e) => e.matricule === 'M001');
  const sana = eleves.find((e) => e.matricule === 'M002');
  const adam = eleves.find((e) => e.matricule === 'M003');
  verifier('Parent voit les inscriptions de ses enfants seulement',
    (await appel('GET', '/inscriptions?annee=2026-2027', { jeton: parent2 })).donnees.every((i) => i.matricule === 'M003'));
  verifier('Parent ne voit pas le dossier d\'un enfant d\'un autre parent',
    (await appel('GET', `/eleves/${youssef.id}/devoirs`, { jeton: parent2 })).statut === 403);

  console.log('\nInscriptions et capacité');
  const classe = await appel('POST', '/classes', { jeton: admin, corps: { niveau: `Test${suffixe}`, section: 'X', capacite_max: 1, annee_scolaire: '2026-2027' } });
  verifier('Création d\'une classe de capacité 1', classe.statut === 201, JSON.stringify(classe.donnees));
  const classeId = classe.donnees.id;
  // Un élève neuf (créé pour ce test) pour que le test puisse être relancé
  const nouvel = await appel('POST', '/eleves', { jeton: admin, corps: { matricule: `A${suffixe}`, nom: 'Essai', prenom: 'Demande', date_naissance: '2019-05-05' } });
  const demande1 = await appel('POST', '/inscriptions', { jeton: admin, corps: { eleve_id: nouvel.donnees.id, annee_scolaire: '2026-2027' } });
  verifier('Première demande d\'inscription acceptée', demande1.statut === 201, JSON.stringify(demande1.donnees));
  const doublon = await appel('POST', '/inscriptions', { jeton: admin, corps: { eleve_id: nouvel.donnees.id, annee_scolaire: '2026-2027' } });
  verifier('Demande déjà existante refusée (doublon)', doublon.statut === 409);
  const valide1 = await appel('POST', `/inscriptions/${demande1.donnees.id}/valider`, { jeton: admin, corps: { classe_id: classeId } });
  verifier('Validation d\'une inscription dans une classe libre', valide1.statut === 200, JSON.stringify(valide1.donnees));
  const eleveTest = await appel('POST', '/eleves', { jeton: admin, corps: { matricule: `T${suffixe}`, nom: 'Test', prenom: 'Élève', date_naissance: '2019-01-01' } });
  await appel('POST', '/inscriptions', { jeton: admin, corps: { eleve_id: eleveTest.donnees.id, annee_scolaire: '2026-2027' } });
  const insTest = (await appel('GET', '/inscriptions?annee=2026-2027&statut=en_attente', { jeton: admin })).donnees.find((i) => i.eleve_id === eleveTest.donnees.id);
  const complete = await appel('POST', `/inscriptions/${insTest.id}/valider`, { jeton: admin, corps: { classe_id: classeId } });
  verifier('Classe complète : validation refusée (409)', complete.statut === 409, JSON.stringify(complete.donnees));

  console.log('\nEmploi du temps');
  const conflit = await appel('POST', '/creneaux', { jeton: admin, corps: {
    classe_id: (await appel('GET', '/classes?annee=2026-2027', { jeton: admin })).donnees.find((c) => c.niveau === 'CP' && c.section === 'B').id,
    matiere_id: (await appel('GET', '/matieres?annee=2026-2027', { jeton: admin })).donnees.find((m) => m.nom === 'Mathématiques').id,
    enseignant_id: (await appel('GET', '/enseignants', { jeton: admin })).donnees[0].enseignant_id,
    jour_semaine: 1, debut: '08:30', fin: '09:30',
  } });
  verifier('Créneau qui chevauche un autre : refusé (409)', conflit.statut === 409, JSON.stringify(conflit.donnees));

  console.log('\nNotes et moyennes');
  const classeA = (await appel('GET', '/classes?annee=2026-2027', { jeton: admin })).donnees.find((c) => c.niveau === 'CP' && c.section === 'A');
  const evaluations = (await appel('GET', `/evaluations?classe_id=${classeA.id}`, { jeton: ens })).donnees;
  const dictee = evaluations.find((e) => e.libelle === 'Dictée n°1');
  const trop = await appel('PUT', `/evaluations/${dictee.id}/notes`, { jeton: ens, corps: { notes: [{ eleve_id: youssef.id, valeur: 12 }] } });
  verifier('Note au-dessus du barème refusée (400)', trop.statut === 400, JSON.stringify(trop.donnees));
  const ok = await appel('PUT', `/evaluations/${dictee.id}/notes`, { jeton: ens, corps: { notes: [{ eleve_id: youssef.id, valeur: 9 }] } });
  verifier('Note correcte enregistrée', ok.statut === 200);
  const moyennes = await appel('GET', `/classes/${dictee.classe_id}/moyennes?trimestre=1&annee=2026-2027`, { jeton: admin });
  const mYoussef = moyennes.donnees.find((m) => m.matricule === 'M001');
  verifier('Moyenne générale calculée (pondérée)', mYoussef && mYoussef.moyenne_generale !== null, JSON.stringify(mYoussef));
  const bulletins = await appel('POST', `/classes/${dictee.classe_id}/bulletins`, { jeton: admin, corps: { trimestre: 1, annee: '2026-2027' } });
  verifier('Bulletins PDF générés', bulletins.statut === 201);
  const liste = await appel('GET', `/eleves/${youssef.id}/bulletins`, { jeton: parent1 });
  const pdf = await appel('GET', `/bulletins/${liste.donnees[0].id}/pdf`, { jeton: parent1 });
  verifier('Le parent télécharge le bulletin (PDF)', pdf.statut === 200 && pdf.type.includes('pdf'));

  console.log('\nPaiements et relances');
  const avant = (await appel('GET', `/eleves/${youssef.id}/finances?annee=2026-2027`, { jeton: admin })).donnees;
  const paye = await appel('POST', '/paiements', { jeton: admin, corps: { eleve_id: youssef.id, montant: 150, mode: 'especes', date_paiement: '2026-10-19' } });
  verifier('Paiement enregistré', paye.statut === 201, JSON.stringify(paye.donnees));
  const recu = await appel('GET', `/paiements/${paye.donnees.id}/recu`, { jeton: parent1 });
  verifier('Reçu PDF téléchargeable par le parent', recu.statut === 200 && recu.type.includes('pdf'));
  const apres = (await appel('GET', `/eleves/${youssef.id}/finances?annee=2026-2027`, { jeton: admin })).donnees;
  verifier('Solde diminué du montant payé', Number(apres.solde_restant) === Number(avant.solde_restant) - 150, `avant=${avant.solde_restant} après=${apres.solde_restant}`);
  const boite = (await appel('GET', '/messages', { jeton: parent1 })).donnees;
  verifier('Le parent reçoit automatiquement le reçu par message', boite.some((m) => m.objet.startsWith('Reçu de paiement')));
  const relances1 = await appel('POST', '/relances', { jeton: admin, corps: { annee_scolaire: '2026-2027' } });
  verifier('Relances traitées par le serveur', relances1.statut === 200, JSON.stringify(relances1.donnees));
  const relances2 = await appel('POST', '/relances', { jeton: admin, corps: { annee_scolaire: '2026-2027' } });
  verifier('Pas de deuxième relance dans la semaine', relances2.donnees.relances_envoyees === 0, JSON.stringify(relances2.donnees));

  console.log('\nAbsences et devoirs');
  const abs = (await appel('GET', `/absences?eleve_id=${youssef.id}&annee=2026-2027`, { jeton: admin })).donnees[0];
  const justif = await appel('POST', `/absences/${abs.id}/justifier`, { jeton: parent1, corps: { justification: 'Maladie, certificat fourni' } });
  verifier('Le parent justifie une absence', justif.statut === 200 && justif.donnees.justifiee === true);
  const devoirs = (await appel('GET', `/eleves/${youssef.id}/devoirs`, { jeton: parent1 })).donnees;
  verifier('Devoir affiché avec son état', devoirs.length > 0 && !!devoirs[0].etat, JSON.stringify(devoirs[0]));

  console.log('\nMessagerie');
  const brouillon = await appel('POST', '/messages', { jeton: parent1, corps: { destinataire_ids: [(await appel('GET', '/messages/contacts', { jeton: parent1 })).donnees.find((c) => c.role === 'enseignant').id], objet: 'Question', corps: 'Bonjour, une question sur le devoir.' } });
  verifier('Brouillon créé', brouillon.statut === 201);
  const envoi = await appel('POST', `/messages/${brouillon.donnees.id}/envoyer`, { jeton: parent1 });
  verifier('Message envoyé', envoi.statut === 200);
  const modif = await appel('PUT', `/messages/${brouillon.donnees.id}`, { jeton: parent1, corps: { destinataire_ids: [], objet: 'Changé', corps: 'Changé' } });
  verifier('Message envoyé : modification refusée', modif.statut === 404);
  const suppr = await appel('DELETE', `/messages/${brouillon.donnees.id}`, { jeton: parent1 });
  verifier('Message envoyé : suppression refusée', suppr.statut !== 200);
  const interdit = await appel('POST', '/messages', { jeton: parent1, corps: { destinataire_ids: [(await appel('GET', '/messages/contacts', { jeton: admin })).donnees.find((c) => c.role === 'parent').id], objet: 'x', corps: 'x' } });
  verifier('Parent ne peut pas écrire à un autre parent', interdit.statut === 403);

  console.log(`\nRésultat : ${reussis} réussi(s), ${echoues} échec(s).`);
  process.exit(echoues === 0 ? 0 : 1);
}

main().catch((erreur) => {
  console.error('Erreur pendant les tests :', erreur);
  process.exit(1);
});
