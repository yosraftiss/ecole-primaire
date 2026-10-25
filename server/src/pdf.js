// Génération des PDF : bulletins scolaires et reçus de paiement.
// Les fichiers sont enregistrés dans le dossier server/storage/.
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE_STOCKAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'storage');

// Renvoie le chemin d'un fichier dans un sous-dossier (le dossier est créé si besoin)
export function cheminStockage(sousDossier, nomFichier) {
  const dossier = path.join(RACINE_STOCKAGE, sousDossier);
  fs.mkdirSync(dossier, { recursive: true });
  return path.join(dossier, nomFichier);
}

// Crée un PDF A4 : « dessiner » reçoit le document et écrit le contenu
function creerPdf(chemin, dessiner) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const flux = fs.createWriteStream(chemin);
    flux.on('finish', resolve);
    flux.on('error', reject);
    doc.pipe(flux);
    dessiner(doc);
    doc.end();
  });
}

// Montant en dinars tunisiens avec 3 décimales (millimes)
export function montantTnd(valeur) {
  return `${Number(valeur).toFixed(3)} TND`;
}

// Bulletin : une page, identité de l'élève, notes par matière, moyenne générale
export function genererBulletinPdf(chemin, donnees) {
  return creerPdf(chemin, (doc) => {
    doc.fontSize(18).text("ÉCOLE PRIMAIRE — BULLETIN SCOLAIRE", { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Année scolaire : ${donnees.annee}     Trimestre : ${donnees.trimestre}`, { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(12).text(`Élève : ${donnees.nomEleve}`);
    doc.text(`Matricule : ${donnees.matricule}`);
    doc.text(`Classe : ${donnees.classe}`);
    doc.moveDown(1);

    // En-tête du tableau
    const x = [50, 300, 400];
    let y = doc.y;
    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('Matière', x[0], y);
    doc.text('Coefficient', x[1], y);
    doc.text('Moyenne /20', x[2], y);
    doc.moveDown(0.5);
    doc.font('Helvetica');

    for (const ligne of donnees.lignes) {
      y = doc.y;
      doc.text(ligne.matiere, x[0], y);
      doc.text(String(ligne.coefficient), x[1], y);
      doc.text(ligne.moyenne === null ? '—' : ligne.moyenne.toFixed(2), x[2], y);
      doc.moveDown(0.6);
    }

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(13);
    doc.text(`Moyenne générale : ${donnees.moyenneGenerale === null ? '—' : donnees.moyenneGenerale.toFixed(2)} / 20`);
    doc.font('Helvetica').fontSize(10);
    doc.moveDown(2);
    doc.text('Le ou la directeur(trice) : ____________________', { align: 'right' });
  });
}

// Reçu de paiement : montant, mode, date, solde restant
export function genererRecuPdf(chemin, donnees) {
  return creerPdf(chemin, (doc) => {
    doc.fontSize(18).text('REÇU DE PAIEMENT', { align: 'center' });
    doc.fontSize(10).text(`N° ${donnees.numero}`, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(12);
    doc.text(`Élève : ${donnees.nomEleve}`);
    doc.text(`Matricule : ${donnees.matricule}`);
    doc.text(`Année scolaire : ${donnees.annee}`);
    doc.moveDown(1);
    doc.text(`Montant versé : ${montantTnd(donnees.montant)}`);
    doc.text(`Mode de paiement : ${donnees.mode}`);
    doc.text(`Date du paiement : ${donnees.datePaiement}`);
    if (donnees.reference) doc.text(`Référence : ${donnees.reference}`);
    doc.moveDown(1);
    doc.text(`Total dû pour l'année : ${montantTnd(donnees.totalDu)}`);
    doc.text(`Total déjà payé : ${montantTnd(donnees.totalPaye)}`);
    doc.font('Helvetica-Bold').text(`Reste à payer : ${montantTnd(donnees.solde)}`);
    doc.font('Helvetica');
    doc.moveDown(3);
    doc.text('Cachet de l\'école', { align: 'right' });
  });
}
