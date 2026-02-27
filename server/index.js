const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const { extractPdfData } = require("./parsePdf.js");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Seuls les fichiers PDF sont acceptés."), false);
    }
    cb(null, true);
  },
});

/**
 * POST /api/parse-pdf
 * Body: multipart/form-data avec un champ "file" (PDF).
 * Réponse: { commune, mois, moisLabel, annee, population, surface, densite, indicateurs, erreur? }
 * Le nom du fichier est utilisé pour extraire commune/mois/année (convention 01_Commune_mois2024.pdf).
 */
app.post("/api/parse-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ erreur: "Aucun fichier PDF envoyé." });
    }

    let filename = req.file.originalname || "document.pdf";
    if (typeof filename === "string" && filename.includes("Ã")) {
      try {
        const decoded = Buffer.from(filename, "latin1").toString("utf8");
        if (decoded && !decoded.includes("Ã")) filename = decoded;
      } catch (_) {}
    }
    const { commune, mois, moisLabel, annee, erreur: nameError } = parseFilename(filename);
    if (nameError) {
      return res.status(400).json({ erreur: nameError });
    }

    const { population, surface, densite, indicateurs } = await extractPdfData(req.file.buffer);

    res.json({
      commune,
      communeKey: commune.toLowerCase(),
      mois,
      moisLabel,
      annee,
      population,
      surface,
      densite,
      fichierSource: filename,
      donneesSource: "exacte",
      donneesReference: true,
      indicateurs,
    });
  } catch (err) {
    console.error("parse-pdf error:", err);
    res.status(500).json({
      erreur: err.message || "Erreur lors de l'extraction du PDF.",
    });
  }
});

/**
 * Corrige les noms de fichier dont l’encodage a été mal interprété (UTF-8 lu en Latin-1).
 */
function fixFilenameEncoding(str) {
  return String(str)
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ã /g, "à")
    .replace(/Ã´/g, "ô")
    .replace(/Ã»/g, "û")
    .replace(/Ã§/g, "ç")
    .replace(/Ã®/g, "î")
    .replace(/Ã¯/g, "ï")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã‰/g, "É")
    .replace(/Ã€/g, "À");
}

/**
 * Parse le nom de fichier pour en extraire commune, mois, année.
 * Formats: 06_Saint_Alban_juin2024.pdf ou Saint_Alban_septembre2023.pdf
 * Gère les accents (décembre, août) et les encodages corrompus.
 */
function parseFilename(filename) {
  let base = filename.replace(/\.pdf$/i, "").trim();
  base = fixFilenameEncoding(base).normalize("NFC");
  // Mois : n’importe quels caractères avant les 4 chiffres de l’année (pour accepter décembre, août, etc.)
  const reA = /^(\d{1,2})_(.+?)_([^\d_]+?)(\d{4})$/;
  const reB = /^(.+?)_([^\d_]+?)(\d{4})$/;
  const MOIS_MAP = {
    janvier: 1, jan: 1, fevrier: 2, février: 2, fev: 2, mars: 3, avril: 4, mai: 5,
    juin: 6, juillet: 7, juil: 7, aout: 8, août: 8, septembre: 9, sept: 9, sep: 9, octobre: 10,
    novembre: 11, decembre: 12, décembre: 12, dec: 12, déc: 12,
  };
  const MOIS_LABELS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  let communeRaw, moisStr, anneeStr;
  const mA = base.match(reA);
  const mB = base.match(reB);
  if (mA) {
    [, , communeRaw, moisStr, anneeStr] = mA;
  } else if (mB) {
    [, communeRaw, moisStr, anneeStr] = mB;
  } else {
    return { erreur: `Format de nom de fichier non reconnu : ${filename}` };
  }

  const moisTrim = moisStr.trim().toLowerCase();
  const moisClean = moisTrim.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  const MOIS_FALLBACK = { delcembre: 12, aoult: 8, aoul: 8 };
  const moisIndex = MOIS_MAP[moisTrim] || MOIS_MAP[moisClean] || MOIS_FALLBACK[moisClean];
  if (!moisIndex) {
    return { erreur: `Mois "${moisStr.trim()}" non reconnu.` };
  }

  const annee = parseInt(anneeStr, 10);
  const commune = communeRaw.replace(/_/g, " ").replace(/-/g, " ").trim();
  const moisLabel = MOIS_LABELS[moisIndex];

  return { commune, mois: moisIndex, moisLabel, annee };
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`API parse-pdf écoute sur http://localhost:${PORT}`);
});
