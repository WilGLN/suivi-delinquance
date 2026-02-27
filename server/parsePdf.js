/**
 * Parse le texte extrait d'un PDF Observatoire de la Délinquance
 * et retourne les indicateurs au format attendu par le frontend.
 */
const pdf = require("pdf-parse");

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

/**
 * À partir du texte brut PDF, extrait les indicateurs.
 * Les PDFs ont des libellés du type "Coups et blessures volontaires" puis deux nombres (N-1, N).
 * On garde N (année courante) pour valN.
 */
function parsePdfText(text) {
  const t = text || "";
  // Normaliser : espaces multiples et retours à la ligne en un espace
  const norm = t.replace(/\s+/g, " ").trim();

  // Paire de nombres N-1 et N sur la même ligne (souvent suivie de " +" ou " -" ou " %")
  // On ignore les paires type (27, 28) ou (37, 38) : premier nombre > 25 et second < 5 → code article
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
      if (a > 25 && b < 5) continue; // exclut (27, 28) etc.
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

  // Population, Surface, Densité
  let population = null;
  let surface = null;
  let densite = null;
  const popMatch = norm.match(/Population\s*\*?\s*:?\s*(\d[\d\s]*)\s*habitants/i);
  if (popMatch) population = normalizeNum(popMatch[1]);
  const surfMatch = norm.match(/Surface\s*:?\s*(\d[\d\s,]*)\s*km/i);
  if (surfMatch) surface = normalizeNum(surfMatch[1]);
  const densMatch = norm.match(/Densité\s*:?\s*(\d[\d\s,]*)\s*hab/i);
  if (densMatch) densite = normalizeNum(densMatch[1]);

  // Nombre de faits constatés : N-1, N (deux premiers entiers), cumul (après "Cumul 20XX" ou "fait(s)) NNN")
  let faitsN1 = null, faitsN = null, cumul = null;
  const faitsIdx = norm.indexOf("Nombre de faits constatés");
  if (faitsIdx !== -1) {
    const block = norm.slice(faitsIdx, faitsIdx + 280);
    const nums = block.match(/\d+/g);
    if (nums && nums.length >= 2) {
      faitsN1 = parseIntStrict(nums[0]);
      faitsN = parseIntStrict(nums[1]);
    }
    // Cumul : nombre à 2-4 chiffres après "fait(s)) " ou "Cumul 20XX"
    const cumulAfterFait = block.match(/fait\s*\(\s*s\s*\)\s*\)\s*(\d{2,4})/i) || block.match(/fait\(s\)\)\s*(\d{2,4})/);
    if (cumulAfterFait) cumul = parseIntStrict(cumulAfterFait[1]);
  }
  if (cumul == null) {
    const cumulMatch = norm.match(/Cumul\s*20\d{2}\s*(\d{2,4})/i);
    if (cumulMatch) cumul = parseIntStrict(cumulMatch[1]);
  }

  // Taux de criminalité : deux nombres en ‰, on prend le second (année N)
  let taux = null;
  const tauxMatch = norm.match(/Taux de criminalité\s*[\d.,\s]+\s*‰\s*([\d.,\s]+)\s*‰/i);
  if (tauxMatch) taux = normalizeNum(tauxMatch[1]);

  // Catégories : on prend le 2e nombre (colonne année N) après chaque libellé
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
    population,
    surface,
    densite,
    faitsN1,
    faitsN,
    cumul,
    taux,
    cbv: cbv ?? getOneIntAfter("Coups et blessures"),
    menaces,
    volsSimp,
    cambRes: cambRes ?? getOneIntAfter("Cambriolages de résidences"),
    cambPro: cambPro ?? cambPro2 ?? getOneIntAfter("Cambriolages de locaux"),
    roulotte,
    destrucVeh,
    incendies,
    stupef,
    autorite,
  };
}

/**
 * Reçoit le buffer du PDF, extrait le texte puis parse.
 * Retourne { population, surface, densite, indicateurs } au format frontend.
 */
async function extractPdfData(pdfBuffer) {
  const data = await pdf(pdfBuffer);
  const raw = parsePdfText(data.text);

  const indicateurs = buildIndicateursFrontend({
    faitsN1: raw.faitsN1,
    faitsN: raw.faitsN,
    cumul: raw.cumul,
    taux: raw.taux,
    cbv: raw.cbv,
    menaces: raw.menaces,
    volsSimp: raw.volsSimp,
    cambRes: raw.cambRes,
    cambPro: raw.cambPro,
    roulotte: raw.roulotte,
    destrucVeh: raw.destrucVeh,
    incendies: raw.incendies,
    stupef: raw.stupef,
    autorite: raw.autorite,
  });

  return {
    population: raw.population,
    surface: raw.surface,
    densite: raw.densite,
    indicateurs,
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
      label: "Faits constatés",
      cat: "Général",
      valN1: faitsN1,
      valN: faitsN,
      cumul,
      variationPct: varPct(faitsN1, faitsN),
      taux,
    },
    general_taux: {
      label: "Taux criminalité (‰)",
      cat: "Général",
      valN1: null,
      valN: taux,
      cumul: null,
      variationPct: null,
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

module.exports = { parsePdfText, extractPdfData };
