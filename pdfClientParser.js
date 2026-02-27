/**
 * Parsing PDF côté client (sans backend) — pour déploiement Netlify / hébergement statique.
 * Utilise pdfjs-dist pour extraire le texte, puis la même logique que server/parsePdf.js.
 */
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function normalizeNum(s) {
  if (s == null || s === "") return null;
  const n = String(s).replace(/\s/g, "").replace(",", ".");
  const v = parseFloat(n);
  return isNaN(v) ? null : v;
}

function parseIntStrict(s) {
  if (s == null || s === "") return null;
  const n = String(s).replace(/\s/g, "");
  const v = parseInt(n, 10);
  return isNaN(v) ? null : v;
}

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

function parseFilename(filename) {
  let base = filename.replace(/\.pdf$/i, "").trim();
  base = fixFilenameEncoding(base).normalize("NFC");
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

function parsePdfText(text) {
  const t = text || "";
  const norm = t.replace(/\s+/g, " ").trim();

  const getTwoIntsAfter = (label) => {
    const idx = norm.indexOf(label);
    if (idx === -1) return [null, null];
    const after = norm.slice(idx + label.length, idx + label.length + 180);
    const re = /(\d+)\s+(\d+)\s*[\+\-%\d]/g;
    let m;
    while ((m = re.exec(after)) !== null) {
      const a = parseIntStrict(m[1]);
      const b = parseIntStrict(m[2]);
      if (a > 200 || b > 200) continue;
      if (a > 25 && b < 5) continue;
      return [a, b];
    }
    return [null, null];
  };

  const getOneIntAfter = (label) => {
    const idx = norm.indexOf(label);
    if (idx === -1) return null;
    const after = norm.slice(idx + label.length, idx + label.length + 80);
    const match = after.match(/\d+/);
    return match ? parseIntStrict(match[0]) : null;
  };

  let population = null, surface = null, densite = null;
  const popMatch = norm.match(/Population\s*\*?\s*:?\s*(\d[\d\s]*)\s*habitants/i);
  if (popMatch) population = normalizeNum(popMatch[1]);
  const surfMatch = norm.match(/Surface\s*:?\s*(\d[\d\s,]*)\s*km/i);
  if (surfMatch) surface = normalizeNum(surfMatch[1]);
  const densMatch = norm.match(/Densité\s*:?\s*(\d[\d\s,]*)\s*hab/i);
  if (densMatch) densite = normalizeNum(densMatch[1]);

  let faitsN1 = null, faitsN = null, cumul = null;
  const faitsIdx = norm.indexOf("Nombre de faits constatés");
  if (faitsIdx !== -1) {
    const block = norm.slice(faitsIdx, faitsIdx + 280);
    const nums = block.match(/\d+/g);
    if (nums && nums.length >= 2) {
      faitsN1 = parseIntStrict(nums[0]);
      faitsN = parseIntStrict(nums[1]);
    }
    const cumulAfterFait = block.match(/fait\s*\(\s*s\s*\)\s*\)\s*(\d{2,4})/i) || block.match(/fait\(s\)\)\s*(\d{2,4})/);
    if (cumulAfterFait) cumul = parseIntStrict(cumulAfterFait[1]);
  }
  if (cumul == null) {
    const cumulMatch = norm.match(/Cumul\s*20\d{2}\s*(\d{2,4})/i);
    if (cumulMatch) cumul = parseIntStrict(cumulMatch[1]);
  }

  let taux = null;
  const tauxMatch = norm.match(/Taux de criminalité\s*[\d.,\s]+\s*‰\s*([\d.,\s]+)\s*‰/i);
  if (tauxMatch) taux = normalizeNum(tauxMatch[1]);

  const [, cbv] = getTwoIntsAfter("Coups et blessures volontaires");
  const [, menaces] = getTwoIntsAfter("Menaces ou chantages");
  const [, volsSimp] = getTwoIntsAfter("Vols simples (41");
  const [, cambRes] = getTwoIntsAfter("Cambriolages de résidences");
  let cambPro = getTwoIntsAfter("Cambriolages de locaux")[1];
  if (cambPro === null) cambPro = getTwoIntsAfter("professionnelle, publique ou associative")[1];
  if (cambPro === null) cambPro = getTwoIntsAfter("professionnelle ou associative (29)")[1];
  let roulotte = getTwoIntsAfter("Vols à la roulotte")[1];
  if (roulotte === null) roulotte = getTwoIntsAfter("roulotte et d'accessoires")[1];
  let destrucVeh = getTwoIntsAfter("Destructions et dégradations de véhicules privés")[1];
  if (destrucVeh === null) destrucVeh = getTwoIntsAfter("véhicules privés (68)")[1];
  const [, incendies] = getTwoIntsAfter("Incendies volontaires de biens");
  let stupef = getTwoIntsAfter("stupéfiants constatées")[1];
  if (stupef === null) stupef = getTwoIntsAfter("législation sur les stupéfiants")[1];
  let autorite = getTwoIntsAfter("Atteintes à l'autorité")[1];
  if (autorite === null) autorite = getTwoIntsAfter("autorité (72, 73)")[1];

  return {
    population, surface, densite, faitsN1, faitsN, cumul, taux,
    cbv: cbv ?? getOneIntAfter("Coups et blessures"),
    menaces, volsSimp,
    cambRes: cambRes ?? getOneIntAfter("Cambriolages de résidences"),
    cambPro: cambPro ?? getOneIntAfter("Cambriolages de locaux"),
    roulotte, destrucVeh, incendies, stupef, autorite,
  };
}

function buildIndicateursFrontend({
  faitsN1, faitsN, cumul, taux, cbv, menaces, volsSimp, cambRes, cambPro,
  roulotte, destrucVeh, incendies, stupef, autorite,
}) {
  const varPct = (n1, n) =>
    n1 != null && n1 > 0 && n != null ? Math.round((n - n1) / n1 * 100) : null;
  return {
    general_faits: {
      label: "Faits constatés", cat: "Général", valN1: faitsN1, valN: faitsN, cumul, variationPct: varPct(faitsN1, faitsN), taux,
    },
    general_taux: {
      label: "Taux criminalité (‰)", cat: "Général", valN1: null, valN: taux, cumul: null, variationPct: null,
    },
    cbv: { label: "Coups et blessures volontaires", cat: "Personnes", valN1: null, valN: cbv, cumul: null, variationPct: null },
    menaces: { label: "Menaces ou chantages", cat: "Personnes", valN1: null, valN: menaces, cumul: null, variationPct: null },
    vols_simples: { label: "Vols simples", cat: "Vols", valN1: null, valN: volsSimp, cumul: null, variationPct: null },
    camb_resid: { label: "Cambriolages résidentiels", cat: "Cambriolages", valN1: null, valN: cambRes, cumul: null, variationPct: null },
    camb_pro: { label: "Cambriolages locaux pro.", cat: "Cambriolages", valN1: null, valN: cambPro, cumul: null, variationPct: null },
    roulotte: { label: "Vols à la roulotte", cat: "Automobile", valN1: null, valN: roulotte, cumul: null, variationPct: null },
    destruc_veh: { label: "Destructions véhicules", cat: "Automobile", valN1: null, valN: destrucVeh, cumul: null, variationPct: null },
    incendies: { label: "Incendies volontaires", cat: "Autres", valN1: null, valN: incendies, cumul: null, variationPct: null },
    stupef: { label: "Infractions stupéfiants", cat: "Autres", valN1: null, valN: stupef, cumul: null, variationPct: null },
    autorite: { label: "Atteintes à l'autorité", cat: "Autres", valN1: null, valN: autorite, cumul: null, variationPct: null },
  };
}

/**
 * Extrait le texte d'un PDF dans le navigateur via PDF.js.
 */
async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map((item) => item.str).join(" ") + " ";
  }
  return fullText;
}

/**
 * Parse un fichier PDF côté client. Retourne le même format que l'API /api/parse-pdf.
 * @param {File} file - Fichier PDF
 * @returns {Promise<{ commune, communeKey, mois, moisLabel, annee, population, surface, densite, fichierSource, indicateurs, erreur? }>}
 */
export async function parsePdfInBrowser(file) {
  const filename = file.name || "document.pdf";
  const { commune, mois, moisLabel, annee, erreur: nameError } = parseFilename(filename);
  if (nameError) {
    return { fichierSource: filename, erreur: nameError };
  }

  let text;
  try {
    text = await extractTextFromPdf(file);
  } catch (err) {
    return { fichierSource: filename, erreur: err.message || "Impossible de lire le PDF." };
  }

  const raw = parsePdfText(text);
  const indicateurs = buildIndicateursFrontend({
    faitsN1: raw.faitsN1, faitsN: raw.faitsN, cumul: raw.cumul, taux: raw.taux,
    cbv: raw.cbv, menaces: raw.menaces, volsSimp: raw.volsSimp, cambRes: raw.cambRes, cambPro: raw.cambPro,
    roulotte: raw.roulotte, destrucVeh: raw.destrucVeh, incendies: raw.incendies, stupef: raw.stupef, autorite: raw.autorite,
  });

  return {
    commune,
    communeKey: commune.toLowerCase(),
    mois,
    moisLabel,
    annee,
    population: raw.population,
    surface: raw.surface,
    densite: raw.densite,
    fichierSource: filename,
    donneesSource: "exacte",
    donneesReference: true,
    indicateurs,
  };
}
