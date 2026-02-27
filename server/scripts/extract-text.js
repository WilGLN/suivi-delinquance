/**
 * Script pour extraire le texte d'un PDF exemple et l'afficher (analyse structure).
 * Usage: node scripts/extract-text.js [chemin.pdf]
 */
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");

const pdfPath = process.argv[2] || path.join(__dirname, "../../PDS_exemples/06_Saint_Alban_juin2024.pdf");

const dataBuffer = fs.readFileSync(pdfPath);
pdf(dataBuffer)
  .then((data) => {
    console.log("--- NUM PAGES:", data.numpages);
    console.log("--- TEXT (first 12000 chars) ---\n");
    console.log(data.text.slice(0, 12000));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
