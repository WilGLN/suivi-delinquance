import { useState, useCallback, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { parsePdfInBrowser } from "./pdfClientParser.js";

// ─────────────────────────────────────────────────────────────
// DESIGN SYSTEM — Inspiré des standards data / criminologie
// (Government Data Viz, law enforcement dashboards, accessibilité)
// ─────────────────────────────────────────────────────────────
const THEME = {
  font: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
  colors: {
    primary: "#0F172A",      // Navy — autorité, sérieux
    primaryLight: "#1E293B",
    accent: "#0D9488",       // Teal — données, analyse (réf. US Data Viz)
    accentHover: "#0F766E",
    info: "#0369A1",         // Bleu institutionnel
    infoBg: "#E0F2FE",
    success: "#059669",
    successBg: "#D1FAE5",
    warning: "#D97706",
    warningBg: "#FEF3C7",
    danger: "#B91C1C",
    dangerBg: "#FEE2E2",
    surface: "#FFFFFF",
    surfaceAlt: "#F8FAFC",
    border: "#E2E8F0",
    borderLight: "#F1F5F9",
    text: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#64748B",
    sidebar: "#0F172A",
    sidebarText: "#E2E8F0",
    sidebarActive: "#0D9488",
    sidebarHover: "rgba(255,255,255,.06)",
  },
  radius: { sm: 6, md: 10, lg: 14 },
  shadow: {
    card: "0 1px 3px rgba(15,23,42,.06)",
    cardHover: "0 4px 14px rgba(15,23,42,.08)",
    dropdown: "0 10px 40px rgba(15,23,42,.12)",
  },
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const variationColor = (pct) => {
  if (pct === null || pct === undefined) return THEME.colors.textMuted;
  if (pct <= 0) return THEME.colors.success;
  if (pct <= 50) return THEME.colors.warning;
  return THEME.colors.danger;
};
const variationBg = (pct) => {
  if (pct === null || pct === undefined) return "transparent";
  if (pct <= 0) return THEME.colors.successBg;
  if (pct <= 50) return THEME.colors.warningBg;
  return THEME.colors.dangerBg;
};
const cellBg = (val) => {
  if (val === null || val === 0) return "transparent";
  if (val <= 4) return "#FFFDE7";
  if (val <= 9) return "#FFF3E0";
  return "#FFEBEE";
};
const alertEmoji = (pct) => {
  if (pct === null) return "—";
  if (pct > 50) return "🔴";
  if (pct >= 0) return "🟡";
  return "🟢";
};
const fmt = (v, dec=1) => v !== null && v !== undefined ? Number(v).toFixed(dec) : "—";
const sum = (arr, key) => arr.reduce((s,x) => s + (x?.indicateurs?.[key]?.valN ?? 0), 0);
const avg = (arr, key) => arr.length ? sum(arr,key)/arr.length : 0;

const CAT_COLORS = {
  "Général":       "#0369A1",
  "Personnes":     "#B91C1C",
  "Vols":          "#D97706",
  "Cambriolages":  "#7C3AED",
  "Automobile":    "#B45309",
  "Autres":        "#0D9488",
};

// ─────────────────────────────────────────────────────────────
// COMPOSANTS UI
// ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = THEME.colors.accent, pct = null }) {
  return (
    <div style={{
      background: THEME.colors.surface, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`,
      padding: "22px 24px", boxShadow: THEME.shadow.card, transition: "box-shadow .2s, border-color .2s",
      fontFamily: THEME.font,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.colors.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1, letterSpacing: "-.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: THEME.colors.textMuted, marginTop: 8 }}>{sub}</div>}
      {pct !== null && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, padding: "4px 10px", borderRadius: 20, background: variationBg(pct), fontSize: 12, fontWeight: 700, color: variationColor(pct) }}>
          {pct > 0 ? "▲" : pct < 0 ? "▼" : "="} {pct > 0 ? "+" : ""}{pct}%
        </div>
      )}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ borderLeft: `4px solid ${THEME.colors.accent}`, paddingLeft: 16, marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: THEME.colors.text, fontFamily: THEME.font }}>{children}</h2>
    </div>
  );
}

function SourceFooter({ commune, moisLabel, annee, fichierSource }) {
  return (
    <div style={{ marginTop: 16, padding: "12px 14px", background: THEME.colors.surfaceAlt, borderRadius: THEME.radius.md, fontSize: 11, color: THEME.colors.textMuted, fontFamily: THEME.font }}>
      <strong>Source :</strong> Observatoire de la Délinquance — {commune} — {moisLabel} {annee}<br/>
      <strong>Fichier :</strong> {fichierSource}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VUE IMPORT — parsing PDF côté client (fonctionne sur Netlify sans backend)
// ─────────────────────────────────────────────────────────────
function ViewImport({ parsedFiles, setParsedFiles, setView, setSimpleSubView }) {
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);

  const processFiles = useCallback(async (files) => {
    const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) return;
    setParsing(true);
    const newEntries = [];
    for (const file of pdfFiles) {
      try {
        const data = await parsePdfInBrowser(file);
        if (data.erreur) {
          newEntries.push({ fichierSource: file.name, erreur: data.erreur });
          continue;
        }
        const dup = parsedFiles.some(f =>
          !f.erreur && f.communeKey === data.communeKey && f.mois === data.mois && f.annee === data.annee
        ) || newEntries.some(f =>
          !f.erreur && f.communeKey === data.communeKey && f.mois === data.mois && f.annee === data.annee
        );
        if (dup) {
          newEntries.push({ fichierSource: file.name, erreur: `Ce mois est déjà importé (${data.moisLabel} ${data.annee} — ${data.commune})` });
          continue;
        }
        newEntries.push(data);
      } catch (err) {
        newEntries.push({ fichierSource: file.name, erreur: err.message || "Erreur lors de l'extraction du PDF." });
      }
    }
    setParsedFiles(prev => [...prev, ...newEntries]);
    setParsing(false);
  }, [parsedFiles, setParsedFiles]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const onInput = (e) => processFiles(Array.from(e.target.files));
  const remove = (idx) => setParsedFiles(prev => prev.filter((_,i) => i !== idx));
  const validCount = parsedFiles.filter(f => !f.erreur).length;

  return (
    <div style={{ maxWidth: 820, fontFamily: THEME.font }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: THEME.colors.text, marginBottom: 6, letterSpacing: "-.02em" }}>Import des données</h1>
      <p style={{ color: THEME.colors.textMuted, marginBottom: 28, fontSize: 15, lineHeight: 1.5 }}>
        Déposez les rapports PDF mensuels de l'Observatoire de la Délinquance — toute commune, toute année.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();if(!parsing)setDragging(true)}}
        onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);if(!parsing)onDrop(e)}}
        style={{
          border: `2px dashed ${parsing ? THEME.colors.textMuted : dragging ? THEME.colors.accent : THEME.colors.border}`,
          borderRadius: THEME.radius.lg, padding: "48px 36px", textAlign: "center",
          background: parsing ? THEME.colors.surfaceAlt : dragging ? "#CCFBF1" : THEME.colors.surfaceAlt,
          transition: "all .2s", cursor: parsing ? "wait" : "pointer", marginBottom: 24,
          pointerEvents: parsing ? "none" : undefined, boxShadow: dragging ? THEME.shadow.card : "none",
        }}
        onClick={()=>{if(!parsing)document.getElementById("pdfInput").click()}}
      >
        <div style={{ fontSize: 44, marginBottom: 12 }}>{parsing ? "⏳" : "📥"}</div>
        <div style={{ fontWeight: 700, color: THEME.colors.text, marginBottom: 6, fontSize: 16 }}>
          {parsing ? "Extraction des données depuis le PDF…" : "Glissez vos fichiers PDF ici"}
        </div>
        <div style={{ fontSize: 13, color: THEME.colors.textMuted }}>
          {parsing ? "Ne fermez pas cette page." : "ou cliquez pour parcourir — données extraites du contenu du PDF"}
        </div>
        <input id="pdfInput" type="file" multiple accept=".pdf" style={{ display: "none" }} onChange={onInput} disabled={parsing}/>
      </div>

      {/* Convention de nommage */}
      <div style={{ background: THEME.colors.infoBg, border: `1px solid #7DD3FC`, borderRadius: THEME.radius.lg, padding: "18px 20px", marginBottom: 28, fontSize: 13, fontFamily: THEME.font }}>
        <div style={{ fontWeight: 700, color: THEME.colors.info, marginBottom: 12, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>📋 Formats de fichiers acceptés</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ background: THEME.colors.surface, borderRadius: THEME.radius.md, padding: "12px 14px", border: `1px solid ${THEME.colors.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: THEME.colors.info, marginBottom: 6 }}>FORMAT A — avec numéro de mois</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: THEME.colors.primaryLight, marginBottom: 6 }}>NN_Commune_moisANNEE.pdf</div>
            {["01_Saint_Alban_janvier2024.pdf","02_Toulouse_fevrier2025.pdf","07_Colomiers_juillet2022.pdf"].map(ex=>(
              <div key={ex} style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: THEME.colors.textSecondary, display: "flex", gap: 6 }}>
                <span style={{ color: THEME.colors.success }}>✓</span>{ex}
              </div>
            ))}
          </div>
          <div style={{ background: THEME.colors.surface, borderRadius: THEME.radius.md, padding: "12px 14px", border: `1px solid ${THEME.colors.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: THEME.colors.info, marginBottom: 6 }}>FORMAT B — sans numéro de mois</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: THEME.colors.primaryLight, marginBottom: 6 }}>Commune_moisANNEE.pdf</div>
            {["Saint_Alban_janvier2024.pdf","Saint_Alban_aout2023.pdf","Toulouse_septembre2025.pdf"].map(ex=>(
              <div key={ex} style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: THEME.colors.textSecondary, display: "flex", gap: 6 }}>
                <span style={{ color: THEME.colors.success }}>✓</span>{ex}
              </div>
            ))}
          </div>
        </div>
        <div style={{ color: THEME.colors.textSecondary, fontSize: 11, borderTop: "1px solid #7DD3FC", paddingTop: 10 }}>
          <strong>Commune</strong> = mots séparés par _ · <strong>mois</strong> = nom français (aout = août…) · <strong>ANNÉE</strong> = 4 chiffres. Si numéro de mois présent, il doit correspondre au nom du mois.
        </div>
      </div>

      {/* File list */}
      {parsedFiles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {parsedFiles.map((f, i) => {
            const ok = !f.erreur;
            return (
              <div key={i} style={{
                background: THEME.colors.surface, border: `1px solid ${ok ? THEME.colors.border : "#FECACA"}`,
                borderRadius: THEME.radius.lg, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 16,
                boxShadow: THEME.shadow.card, fontFamily: THEME.font,
              }}>
                <div style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}>{ok ? "✅" : "❌"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: THEME.colors.text, wordBreak: "break-all" }}>{f.fichierSource}</div>
                  {ok ? (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: THEME.colors.textSecondary, fontWeight: 600 }}>{f.commune}</span>
                      <span style={{ fontSize: 11, color: THEME.colors.border }}>·</span>
                      <span style={{ fontSize: 13, color: THEME.colors.textSecondary }}>{f.moisLabel} {f.annee}</span>
                      {f.population && <><span style={{ fontSize: 11, color: THEME.colors.border }}>·</span><span style={{ fontSize: 13, color: THEME.colors.textMuted }}>{f.population.toLocaleString()} hab.</span></>}
                      {f.donneesSource === "exacte" && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: THEME.colors.successBg, color: THEME.colors.success }}>✓ Données extraites du PDF</span>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: THEME.colors.danger, marginTop: 6, whiteSpace: "pre-line", lineHeight: 1.6 }}>{f.erreur}</div>
                  )}
                </div>
                <button onClick={()=>remove(i)} style={{ background: "none", border: "none", cursor: "pointer", color: THEME.colors.textMuted, fontSize: 18, padding: 4, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      <button
        disabled={validCount === 0}
        onClick={()=>{ setView("analyse-simple"); setSimpleSubView?.("dashboard"); }}
        style={{
          padding: "14px 32px", background: validCount > 0 ? THEME.colors.accent : THEME.colors.border,
          color: "#fff", border: "none", borderRadius: THEME.radius.md, fontWeight: 700, fontSize: 15,
          cursor: validCount > 0 ? "pointer" : "not-allowed", transition: "background .2s, transform .1s",
          fontFamily: THEME.font, boxShadow: validCount > 0 ? "0 2px 8px rgba(13,148,136,.35)" : "none",
        }}
      >
        Analyser les données {validCount > 0 ? `(${validCount} fichier${validCount > 1 ? "s" : ""})` : ""}
      </button>
    </div>
  );
}

// Interprétation du taux pour 1 000 hab. (référence SSMSI / analyse criminologique)
const tauxInterpretation = (taux) => {
  if (taux == null) return { label: "—", color: "#94A3B8" };
  const t = Number(taux);
  if (t < 4) return { label: "Faible", color: "#22C55E" };
  if (t <= 8) return { label: "Modéré", color: "#F59E0B" };
  return { label: "Élevé", color: "#EF4444" };
};

// ─────────────────────────────────────────────────────────────
// VUE DASHBOARD
// ─────────────────────────────────────────────────────────────
function ViewDashboard({ parsedFiles }) {
  const valid = parsedFiles.filter(f => !f.erreur).sort((a,b)=>a.mois-b.mois);
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (valid.length === 0) {
    return <div style={{color:THEME.colors.textMuted,fontSize:16,marginTop:40,fontFamily:THEME.font}}>Aucune donnée. Importez des fichiers PDF.</div>;
  }

  const d = valid[selectedIdx] || valid[0];
  const inds = d.indicateurs;
  const totalFaits = d.indicateurs.general_faits.valN ?? 0;
  const faitsInd = inds.general_faits;
  const tauxNum = inds.general_taux.valN != null ? Number(inds.general_taux.valN) : null;
  const tauxInterp = tauxInterpretation(tauxNum);

  const topCat = Object.entries(inds)
    .filter(([k])=>k!=="general_faits"&&k!=="general_taux")
    .sort((a,b)=>(b[1].valN??0)-(a[1].valN??0))[0];

  const radarData = Object.entries(CAT_COLORS).map(([cat]) => ({
    cat,
    valeur: Object.values(inds).filter(x=>x.cat===cat).reduce((s,x)=>s+(x.valN??0),0)
  }));

  const tableRows = Object.entries(inds).filter(([k])=>k!=="general_taux");
  const structurePct = totalFaits > 0 ? tableRows.filter(([k])=>k!=="general_faits").map(([k,v])=>({ key:k, label:v.label, val:v.valN??0, pct:Math.round((v.valN??0)/totalFaits*100) })).filter(x=>x.val>0).sort((a,b)=>b.pct-a.pct) : [];

  const alertes = tableRows.filter(([,v])=>(v.variationPct != null && v.variationPct >= 30) || ((v.valN??0) >= 8 && v.variationPct != null && v.variationPct > 0)).map(([k,v])=>({ label:v.label, val:v.valN, pct:v.variationPct }));

  const synthèse = faitsInd.variationPct != null
    ? `En ${d.moisLabel} ${d.annee}, ${faitsInd.valN} faits constatés (${faitsInd.variationPct > 0 ? "+" : ""}${faitsInd.variationPct}% par rapport à ${d.moisLabel} N-1). Taux de criminalité : ${tauxNum != null ? tauxNum + " ‰" : "—"} pour 1 000 habitants — niveau ${tauxInterp.label.toLowerCase()}.`
    : `En ${d.moisLabel} ${d.annee}, ${faitsInd.valN} faits constatés. Taux : ${tauxNum != null ? tauxNum + " ‰" : "—"} pour 1 000 habitants — niveau ${tauxInterp.label.toLowerCase()}.`;

  return (
    <div style={{ fontFamily: THEME.font }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:16}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:800,color:THEME.colors.text,margin:0,letterSpacing:"-.02em",fontFamily:THEME.font}}>Dashboard — {d.commune}</h1>
          <div style={{fontSize:13,color:THEME.colors.textMuted,marginTop:4}}>Données {d.annee} · Source : faits constatés police et gendarmerie</div>
        </div>
        {valid.length > 1 && (
          <select value={selectedIdx} onChange={e=>setSelectedIdx(Number(e.target.value))}
            style={{padding:"10px 16px",borderRadius:THEME.radius.md,border:`1px solid ${THEME.colors.border}`,fontSize:14,background:THEME.colors.surface,color:THEME.colors.text,fontWeight:600,cursor:"pointer",fontFamily:THEME.font,boxShadow:THEME.shadow.card}}>
            {valid.map((f,i)=>(
              <option key={i} value={i}>{f.moisLabel} {f.annee}</option>
            ))}
          </select>
        )}
      </div>

      {/* Synthèse expert */}
      <div style={{background:THEME.colors.infoBg,border:"1px solid #7DD3FC",borderRadius:THEME.radius.lg,padding:"18px 22px",marginBottom:28,fontSize:14,color:"#0C4A6E",lineHeight:1.55}}>
        <div style={{fontWeight:700,color:THEME.colors.info,marginBottom:8,fontSize:11,textTransform:"uppercase",letterSpacing:".08em"}}>Synthèse d’analyse</div>
        {synthèse}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:18,marginBottom:28}}>
        <KpiCard label="Faits constatés" value={faitsInd.valN} sub={`N-1 : ${faitsInd.valN1 ?? "—"}`} color={THEME.colors.info} pct={faitsInd.variationPct}/>
        <KpiCard label="Taux pour 1 000 hab." value={tauxNum != null ? `${tauxNum}‰` : "—"} sub={tauxInterp.label} color={tauxInterp.color}/>
        <KpiCard label="Catégorie dominante" value={topCat?.[1]?.valN ?? "—"} sub={topCat?.[1]?.label ?? "—"} color={THEME.colors.warning}/>
        <KpiCard label="Cumul annuel" value={faitsInd.cumul} sub={`à fin ${d.moisLabel}`} color={THEME.colors.accent}/>
      </div>

      {/* Points de vigilance */}
      {alertes.length > 0 && (
        <div style={{background:THEME.colors.warningBg,border:"1px solid #FCD34D",borderRadius:THEME.radius.lg,padding:"16px 20px",marginBottom:28,fontSize:13,fontFamily:THEME.font}}>
          <div style={{fontWeight:700,color:"#92400E",marginBottom:8}}>Points de vigilance</div>
          <ul style={{margin:0,paddingLeft:20,color:"#78350F"}}>
            {alertes.slice(0,5).map((a,i)=>(<li key={i}>{a.label} : {a.val} faits{a.pct != null ? ` (${a.pct > 0 ? "+" : ""}${a.pct}% vs N-1)` : ""}</li>))}
          </ul>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:28}}>
        <div style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:24,boxShadow:THEME.shadow.card}}>
          <SectionHeader>Répartition par catégorie</SectionHeader>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={THEME.colors.border}/>
              <PolarAngleAxis dataKey="cat" tick={{fontSize:11,fill:THEME.colors.textSecondary}}/>
              <PolarRadiusAxis angle={90} tick={{fontSize:10,fill:THEME.colors.textMuted}}/>
              <Radar name="Faits" dataKey="valeur" stroke={THEME.colors.accent} fill={THEME.colors.accent} fillOpacity={0.2}/>
              <Tooltip/>
            </RadarChart>
          </ResponsiveContainer>
          {structurePct.length > 0 && (
            <div style={{marginTop:12,fontSize:11,color:THEME.colors.textMuted}}><strong>Structure du mois :</strong> {structurePct.slice(0,4).map(s=>`${s.label} ${s.pct}%`).join(" · ")}</div>
          )}
          <SourceFooter commune={d.commune} moisLabel={d.moisLabel} annee={d.annee} fichierSource={d.fichierSource}/>
        </div>

        <div style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:24,boxShadow:THEME.shadow.card}}>
          <SectionHeader>Indicateurs du mois</SectionHeader>
          <div style={{overflowY:"auto",maxHeight:320}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:THEME.font}}>
              <thead>
                <tr style={{background:THEME.colors.surfaceAlt}}>
                  <th style={{textAlign:"left",padding:"10px 12px",color:THEME.colors.textMuted,fontWeight:700,fontSize:11,borderBottom:`2px solid ${THEME.colors.border}`,textTransform:"uppercase",letterSpacing:".04em"}}>Indicateur</th>
                  <th style={{textAlign:"right",padding:"10px 12px",color:THEME.colors.textMuted,fontWeight:700,fontSize:11,borderBottom:`2px solid ${THEME.colors.border}`}}>Val. N</th>
                  <th style={{textAlign:"right",padding:"10px 12px",color:THEME.colors.textMuted,fontWeight:700,fontSize:11,borderBottom:`2px solid ${THEME.colors.border}`}}>% total</th>
                  <th style={{textAlign:"right",padding:"10px 12px",color:THEME.colors.textMuted,fontWeight:700,fontSize:11,borderBottom:`2px solid ${THEME.colors.border}`}}>Var.</th>
                  <th style={{textAlign:"right",padding:"10px 12px",color:THEME.colors.textMuted,fontWeight:700,fontSize:11,borderBottom:`2px solid ${THEME.colors.border}`}}>Cumul</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(([k,v])=>(
                  <tr key={k} style={{borderBottom:`1px solid ${THEME.colors.borderLight}`}}>
                    <td style={{padding:"10px 12px",color:THEME.colors.textSecondary}}>{v.label}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:600,color:THEME.colors.text,background:cellBg(v.valN)}}>{v.valN ?? "—"}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",color:THEME.colors.textMuted}}>{totalFaits > 0 && v.valN != null ? Math.round((v.valN/totalFaits)*100) + "%" : "—"}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",color:variationColor(v.variationPct),fontWeight:600,fontSize:12}}>{v.variationPct !== null ? `${v.variationPct > 0 ? "+" : ""}${v.variationPct}%` : "—"}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",color:THEME.colors.textMuted}}>{v.cumul ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VUE TENDANCES
// ─────────────────────────────────────────────────────────────
function ViewTendances({ parsedFiles }) {
  const valid = parsedFiles.filter(f => !f.erreur).sort((a,b) => a.mois - b.mois);
  if (valid.length < 2) return <div style={{color:THEME.colors.textMuted,marginTop:40,fontFamily:THEME.font}}>Importez au moins 2 fichiers pour afficher les tendances.</div>;

  const moisLoaded = new Set(valid.map(f=>f.mois));
  const moisMin = Math.min(...moisLoaded);
  const moisMax = Math.max(...moisLoaded);
  const LABELS = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const missing = [];
  for (let m = moisMin; m <= moisMax; m++) if (!moisLoaded.has(m)) missing.push(LABELS[m]);

  const totalPeriode = valid.reduce((s,f)=>s+(f.indicateurs.general_faits.valN??0),0);
  const premierMois = valid[0].indicateurs.general_faits.valN ?? 0;
  const dernierMois = valid[valid.length-1].indicateurs.general_faits.valN ?? 0;
  const variationGlissement = premierMois > 0 ? Math.round((dernierMois - premierMois) / premierMois * 100) : null;
  const moyenneMobile3 = (i) => {
    if (i < 2) return null;
    const slice = valid.slice(i-2, i+1);
    const sum = slice.reduce((s,f)=>s+(f.indicateurs.general_faits.valN??0),0);
    return Math.round(sum / 3 * 10) / 10;
  };

  const lineData = valid.map((f,i) => ({
    mois: f.moisLabel.slice(0,3),
    "Faits constatés": f.indicateurs.general_faits.valN,
    "Taux ‰ (1 000 hab.)": f.indicateurs.general_faits.taux != null ? Number(f.indicateurs.general_faits.taux) : null,
    "Moy. mobile 3 mois": moyenneMobile3(i),
  }));

  const barData = valid.map(f => ({
    mois: f.moisLabel.slice(0,3),
    Personnes: (f.indicateurs.cbv.valN??0)+(f.indicateurs.menaces.valN??0),
    Vols: (f.indicateurs.vols_simples.valN??0),
    Cambriolages: (f.indicateurs.camb_resid.valN??0)+(f.indicateurs.camb_pro.valN??0),
    Automobile: (f.indicateurs.roulotte.valN??0)+(f.indicateurs.destruc_veh.valN??0),
    Autres: (f.indicateurs.incendies.valN??0)+(f.indicateurs.stupef.valN??0)+(f.indicateurs.autorite.valN??0),
  }));

  const trims = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]];
  const trimData = trims.map((months,i)=>{
    const data = valid.filter(f=>months.includes(f.mois));
    const total = data.reduce((s,f)=>s+(f.indicateurs.general_faits.valN??0),0);
    return { trim: `T${i+1}`, mois: data.map(f=>f.moisLabel.slice(0,3)).join("–"), total, count: data.length };
  }).filter(t=>t.count>0);

  const indKeys = ["cbv","menaces","vols_simples","camb_resid","camb_pro","roulotte","destruc_veh","incendies","stupef","autorite"];
  const evolutionParIndicateur = indKeys.map(k=>{
    const first = valid[0]?.indicateurs[k]?.valN ?? 0;
    const last = valid[valid.length-1]?.indicateurs[k]?.valN ?? 0;
    const sum = valid.reduce((s,f)=>s+(f.indicateurs[k]?.valN??0),0);
    const label = valid[0]?.indicateurs[k]?.label ?? k;
    const pct = first > 0 ? Math.round((last - first) / first * 100) : (last > 0 ? 100 : 0);
    return { key:k, label, first, last, sum, pct };
  }).filter(x=>x.sum>0);
  const topHausses = [...evolutionParIndicateur].filter(x=>x.pct>0).sort((a,b)=>b.pct-a.pct).slice(0,3);
  const topBaisses = [...evolutionParIndicateur].filter(x=>x.pct<0).sort((a,b)=>a.pct-b.pct).slice(0,3);

  const partDominante = totalPeriode > 0 ? evolutionParIndicateur.sort((a,b)=>b.sum-a.sum)[0] : null;
  const synthèseTendances = variationGlissement != null
    ? `Sur la période ${valid[0].moisLabel} — ${valid[valid.length-1].moisLabel} ${valid[0].annee}, les faits constatés sont en ${variationGlissement >= 0 ? "hausse" : "baisse"} de ${Math.abs(variationGlissement)}% (glissement premier → dernier mois). Total : ${totalPeriode} faits.${partDominante ? ` La catégorie la plus représentée est « ${partDominante.label} » (${Math.round(partDominante.sum/totalPeriode*100)}% du total).` : ""}`
    : `Sur la période, ${totalPeriode} faits constatés au total.${partDominante ? ` Catégorie dominante : ${partDominante.label} (${Math.round(partDominante.sum/totalPeriode*100)}%).` : ""}`;

  return (
    <div style={{ fontFamily: THEME.font }}>
      <h1 style={{fontSize:24,fontWeight:800,color:THEME.colors.text,marginBottom:8,letterSpacing:"-.02em"}}>Tendances mensuelles</h1>
      <div style={{fontSize:13,color:THEME.colors.textMuted,marginBottom:28}}>Analyse des séries chronologiques · Moyenne mobile 3 mois (lissage)</div>

      {missing.length > 0 && (
        <div style={{background:THEME.colors.warningBg,border:"1px solid #FCD34D",borderRadius:THEME.radius.md,padding:"14px 18px",marginBottom:24,fontSize:13,color:"#92400E",display:"flex",gap:8,alignItems:"center"}}>
          <span>⚠️</span>
          <span>Données manquantes : {missing.join(", ")} {valid[0]?.annee} non importé{missing.length>1?"s":""}</span>
        </div>
      )}

      {/* Synthèse tendances */}
      <div style={{background:THEME.colors.infoBg,border:"1px solid #7DD3FC",borderRadius:THEME.radius.lg,padding:"18px 22px",marginBottom:28,fontSize:14,color:"#0C4A6E",lineHeight:1.55}}>
        <div style={{fontWeight:700,color:THEME.colors.info,marginBottom:8,fontSize:11,textTransform:"uppercase",letterSpacing:".08em"}}>Synthèse d’analyse</div>
        {synthèseTendances}
      </div>

      {/* Évolution faits + taux + moyenne mobile */}
      <div style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:24,marginBottom:28,boxShadow:THEME.shadow.card}}>
        <SectionHeader>Évolution des faits constatés et du taux pour 1 000 hab.</SectionHeader>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.colors.borderLight}/>
            <XAxis dataKey="mois" tick={{fontSize:12,fill:THEME.colors.textMuted}}/>
            <YAxis yAxisId="left" tick={{fontSize:12,fill:THEME.colors.textMuted}}/>
            <YAxis yAxisId="right" orientation="right" tick={{fontSize:12,fill:THEME.colors.textMuted}}/>
            <Tooltip formatter={(v)=>v != null ? (Number(v) === v && v % 1 !== 0 ? v.toFixed(2) : v) : "—"}/>
            <Legend/>
            <Line yAxisId="left" type="monotone" dataKey="Faits constatés" stroke={THEME.colors.info} strokeWidth={2.5} dot={{r:4,fill:THEME.colors.info}} connectNulls name="Faits constatés"/>
            <Line yAxisId="left" type="monotone" dataKey="Moy. mobile 3 mois" stroke="#7C3AED" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls name="Moy. mobile 3 mois"/>
            <Line yAxisId="right" type="monotone" dataKey="Taux ‰ (1 000 hab.)" stroke={THEME.colors.accent} strokeWidth={2} dot={{r:3,fill:THEME.colors.accent}} connectNulls name="Taux ‰"/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{fontSize:11,color:THEME.colors.textMuted,marginTop:8}}>Moyenne mobile 3 mois : lissage des variations saisonnières (référence SSMSI).</div>
      </div>

      {trimData.length > 0 && (
        <div style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:24,marginBottom:28,boxShadow:THEME.shadow.card}}>
          <SectionHeader>Agrégat trimestriel</SectionHeader>
          <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
            {trimData.map(t=>(
              <div key={t.trim} style={{background:THEME.colors.surfaceAlt,borderRadius:THEME.radius.md,padding:"14px 18px",minWidth:120,border:`1px solid ${THEME.colors.border}`}}>
                <div style={{fontSize:11,fontWeight:700,color:THEME.colors.textMuted,marginBottom:4}}>{t.trim}</div>
                <div style={{fontSize:20,fontWeight:800,color:THEME.colors.text}}>{t.total}</div>
                <div style={{fontSize:11,color:THEME.colors.textMuted}}>faits · {t.mois}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(topHausses.length > 0 || topBaisses.length > 0) && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:28}}>
          {topHausses.length > 0 && (
            <div style={{background:THEME.colors.dangerBg,border:"1px solid #FECACA",borderRadius:THEME.radius.lg,padding:"16px 18px",fontSize:13}}>
              <div style={{fontWeight:700,color:THEME.colors.danger,marginBottom:8}}>Hausses marquées (glissement)</div>
              <ul style={{margin:0,paddingLeft:20,color:"#991B1B"}}>
                {topHausses.map((x,i)=>(<li key={i}>{x.label} : +{x.pct}%</li>))}
              </ul>
            </div>
          )}
          {topBaisses.length > 0 && (
            <div style={{background:THEME.colors.successBg,border:"1px solid #BBF7D0",borderRadius:THEME.radius.lg,padding:"16px 18px",fontSize:13}}>
              <div style={{fontWeight:700,color:THEME.colors.success,marginBottom:8}}>Baisses marquées (glissement)</div>
              <ul style={{margin:0,paddingLeft:20,color:"#166534"}}>
                {topBaisses.map((x,i)=>(<li key={i}>{x.label} : {x.pct}%</li>))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:24,boxShadow:THEME.shadow.card}}>
        <SectionHeader>Répartition par catégorie</SectionHeader>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.colors.borderLight}/>
            <XAxis dataKey="mois" tick={{fontSize:12,fill:THEME.colors.textMuted}}/>
            <YAxis tick={{fontSize:12,fill:THEME.colors.textMuted}}/>
            <Tooltip/>
            <Legend/>
            {Object.entries(CAT_COLORS).filter(([c])=>c!=="Général").map(([cat,col])=>(
              <Bar key={cat} dataKey={cat} stackId="a" fill={col} name={cat}/>
            ))}
          </BarChart>
        </ResponsiveContainer>
        <SourceFooter commune={valid[0]?.commune} moisLabel={`${valid[0]?.moisLabel} — ${valid[valid.length-1]?.moisLabel}`} annee={valid[0]?.annee} fichierSource={`${valid.length} fichiers importés`}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VUE RAPPORT
// ─────────────────────────────────────────────────────────────
function ViewRapport({ parsedFiles }) {
  const valid = parsedFiles.filter(f => !f.erreur).sort((a,b) => a.mois - b.mois);
  if (valid.length === 0) return <div style={{color:THEME.colors.textMuted,marginTop:40,fontFamily:THEME.font}}>Aucune donnée. Importez des fichiers PDF.</div>;

  const commune = valid[0].commune;
  const annee = valid[0].annee;
  const population = valid[0].population;
  const surface = valid[0].surface;
  const densite = valid[0].densite;
  const dernierMois = valid[valid.length-1];
  const periode = valid.length === 1 ? `${valid[0].moisLabel} ${annee}` : `${valid[0].moisLabel} — ${dernierMois.moisLabel} ${annee}`;

  // Computed sums
  const totalFaitsN = valid.reduce((s,f)=>s+(f.indicateurs.general_faits.valN??0),0);
  const totalFaitsN1 = valid.reduce((s,f)=>s+(f.indicateurs.general_faits.valN1??0),0);
  const varGlobal = totalFaitsN1 > 0 ? Math.round((totalFaitsN-totalFaitsN1)/totalFaitsN1*100) : null;
  const cumul = dernierMois.indicateurs.general_faits.cumul;
  const tauxMoyen = valid.length ? (valid.reduce((s,f)=>s+(f.indicateurs.general_faits.taux??0),0)/valid.length).toFixed(2) : "—";

  const sumKey = (k) => valid.reduce((s,f)=>s+(f.indicateurs[k]?.valN??0),0);
  const sRoulotte = sumKey("roulotte");
  const sDestruc = sumKey("destruc_veh");
  const sCambRes = sumKey("camb_resid");
  const sCambPro = sumKey("camb_pro");
  const sIncendies = sumKey("incendies");
  const sStupef = sumKey("stupef");
  const sAutorite = sumKey("autorite");
  const sCbv = sumKey("cbv");
  const sMenaces = sumKey("menaces");
  const sVolsSimp = sumKey("vols_simples");

  const LABELS = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  // Pic roulotte
  const picRoulotte = valid.reduce((best,f) => (f.indicateurs.roulotte.valN??0)>(best?.indicateurs?.roulotte?.valN??0)?f:best, valid[0]);
  const picFaits = valid.reduce((best,f) => (f.indicateurs.general_faits.valN??0)>(best?.indicateurs?.general_faits?.valN??0)?f:best, valid[0]);

  // Trimestres
  const trims = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]];
  const trimData = trims.map((months,i) => {
    const data = valid.filter(f=>months.includes(f.mois));
    return { t: i+1, mois: data.map(f=>f.moisLabel), total: data.reduce((s,f)=>s+(f.indicateurs.general_faits.valN??0),0) };
  }).filter(t=>t.total>0);

  const today = new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"});
  const fichiersList = valid.map(f=>f.fichierSource).join(", ");

  const thStyle = {padding:"8px 12px",background:"#EFF6FF",color:"#1E293B",fontWeight:700,fontSize:12,borderBottom:"2px solid #BFDBFE",textAlign:"left"};
  const tdStyle = (val=null) => ({padding:"7px 12px",fontSize:13,color:"#334155",background:cellBg(val),borderBottom:"1px solid #F1F5F9"});
  const h2Style = {fontSize:17,fontWeight:700,color:"#1E293B",margin:"32px 0 12px",paddingBottom:8,borderBottom:"2px solid #E2E8F0"};
  const h3Style = {fontSize:14,fontWeight:700,color:"#334155",margin:"20px 0 8px"};

  const [copyStatus, setCopyStatus] = useState("");
  const [docxStatus, setDocxStatus] = useState("");
  const reportContentRef = useRef(null);

  // ── Copier le texte brut ────────────────────────────────────
  const copyReport = async () => {
    const el = reportContentRef.current || document.getElementById("rapport-content");
    let text = el?.innerText?.trim() || "";
    if (!text) {
      // Fallback : construire le texte à partir des données
      const lines = [
        `OBSERVATOIRE DE LA DÉLINQUANCE`,
        `COMMUNE DE ${commune.toUpperCase()}`,
        `RAPPORT D'ANALYSE CRIMINOLOGIQUE — ${annee}`,
        ``,
        `Population: ${population?.toLocaleString()} habitants | Surface: ${surface} km² | Densité: ${densite} hab./km²`,
        ``,
        `CHAPITRE 1 — SYNTHÈSE EXÉCUTIVE`,
        `L'analyse des données de délinquance de la commune de ${commune} pour la période ${periode} révèle une tendance générale ${varGlobal === null ? "" : varGlobal <= 0 ? "à la baisse" : "à la hausse"} du nombre total de faits constatés${varGlobal !== null ? ` (${varGlobal > 0 ? "+" : ""}${varGlobal}% par rapport à N-1)` : ""}.`,
        `Avec ${cumul ?? totalFaitsN} faits constatés pour une population de ${population?.toLocaleString()} habitants, le taux de criminalité moyen s'établit à environ ${tauxMoyen}‰ pour 1 000 habitants.`,
        ``,
        ...valid.map(f => {
          const ind = f.indicateurs.general_faits;
          return `${f.moisLabel}: ${ind.valN} faits (cumul: ${ind.cumul ?? "-"}, taux: ${ind.taux}‰)`;
        })
      ];
      text = lines.join("\n");
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("✓ Copié !");
      setTimeout(() => setCopyStatus(""), 2500);
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) {
          setCopyStatus("✓ Copié !");
          setTimeout(() => setCopyStatus(""), 2500);
        } else {
          setCopyStatus("❌ Échec de la copie");
          setTimeout(() => setCopyStatus(""), 3000);
        }
      } catch (e2) {
        setCopyStatus("❌ Échec : " + (e2?.message || "copie non supportée"));
        setTimeout(() => setCopyStatus(""), 4000);
      }
    }
  };

  // ── Imprimer avec CSS print adapté ─────────────────────────
  const printReport = () => {
    const el = reportContentRef.current || document.getElementById("rapport-content");
    if (!el) {
      alert("Contenu du rapport introuvable. Réessayez.");
      return;
    }
    const style = document.createElement("style");
    style.id = "print-style-rapport";
    style.textContent = `
      @media print {
        body > *:not(#rapport-print-wrapper) { display: none !important; }
        #rapport-print-wrapper { display: block !important; position: static !important; width: 100% !important; max-width: 100% !important; min-height: 0 !important; height: auto !important; overflow: visible !important; background: #fff !important; padding: 20px !important; box-shadow: none !important; }
        #rapport-print-wrapper * { box-shadow: none !important; }
        @page { margin: 1.5cm; }
      }
    `;
    const wrapper = document.createElement("div");
    wrapper.id = "rapport-print-wrapper";
    wrapper.style.display = "none";
    const clone = el.cloneNode(true);
    clone.style.maxWidth = "900px";
    clone.style.margin = "0 auto";
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);
    document.head.appendChild(style);
    const cleanup = () => {
      try {
        if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
        if (style.parentNode) document.head.removeChild(style);
      } catch (_) {}
    };
    window.onafterprint = cleanup;
    window.print();
    setTimeout(cleanup, 2000);
  };

  // ── Exporter DOCX ──────────────────────────────────────────
  const exportDocx = async () => {
    setDocxStatus("⏳ Génération...");
    try {
      const docx = await import("docx");
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
        LevelFormat, PageBreak
      } = docx;

      const border = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
      const borders = { top: border, bottom: border, left: border, right: border };
      const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
      const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

      const mkP = (text, opts={}) => new Paragraph({
        children: [new TextRun({ text: String(text ?? ""), font:"Arial", size: opts.size||24, bold:opts.bold||false, color:opts.color||"1E293B", italics:opts.italic||false })],
        alignment: opts.align || AlignmentType.LEFT,
        spacing: { before: opts.before||0, after: opts.after||120 },
      });

      const mkH = (text, level=1) => new Paragraph({
        heading: level===1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        children: [new TextRun({ text, font:"Arial", size: level===1?28:24, bold:true, color: level===1?"1E40AF":"334155" })],
        spacing: { before:320, after:160 },
        border: level===1 ? { bottom: { style: BorderStyle.SINGLE, size:4, color:"BFDBFE", space:4 } } : {},
      });

      const mkH3 = (text) => new Paragraph({
        children: [new TextRun({ text, font:"Arial", size:22, bold:true, color:"475569" })],
        spacing: { before:240, after:80 },
      });

      const mkBullet = (text) => new Paragraph({
        numbering: { reference:"bullets", level:0 },
        children: [new TextRun({ text: String(text), font:"Arial", size:22, color:"1E293B" })],
        spacing: { before:40, after:40 },
      });

      const mkTable = (headers, rows, colWidths) => {
        const totalW = colWidths.reduce((a,b)=>a+b,0);
        return new Table({
          width: { size: totalW, type: WidthType.DXA },
          columnWidths: colWidths,
          rows: [
            new TableRow({
              tableHeader: true,
              children: headers.map((h,i) => new TableCell({
                borders, width: { size: colWidths[i], type: WidthType.DXA },
                shading: { fill:"EFF6FF", type: ShadingType.CLEAR },
                margins: { top:80, bottom:80, left:120, right:120 },
                children: [new Paragraph({ children: [new TextRun({ text:h, font:"Arial", size:20, bold:true, color:"1E293B" })] })],
              }))
            }),
            ...rows.map(row => new TableRow({
              children: row.map((cell,i) => new TableCell({
                borders, width: { size: colWidths[i], type: WidthType.DXA },
                margins: { top:60, bottom:60, left:120, right:120 },
                children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? "—"), font:"Arial", size:20, color:"334155" })] })],
              }))
            }))
          ]
        });
      };

      const blankLine = () => new Paragraph({ children:[], spacing:{ before:0, after:120 } });

      // ── Construction du document ────────────────────────────
      const children = [];

      // PAGE DE COUVERTURE
      children.push(new Paragraph({ children:[new TextRun({ text:"OBSERVATOIRE DE LA DÉLINQUANCE", font:"Arial", size:24, bold:true, color:"64748B", allCaps:true })], alignment:AlignmentType.CENTER, spacing:{before:480,after:120} }));
      children.push(new Paragraph({ children:[new TextRun({ text:`COMMUNE DE ${commune.toUpperCase()}`, font:"Arial", size:40, bold:true, color:"1E293B" })], alignment:AlignmentType.CENTER, spacing:{before:0,after:120} }));
      children.push(new Paragraph({ children:[new TextRun({ text:`RAPPORT D'ANALYSE CRIMINOLOGIQUE — ${annee}`, font:"Arial", size:28, bold:true, color:"1E40AF" })], alignment:AlignmentType.CENTER, spacing:{before:0,after:240} }));
      children.push(new Paragraph({ children:[new TextRun({ text:"Réalisé à partir des données mensuelles de l'Observatoire de la Délinquance", font:"Arial", size:20, italics:true, color:"64748B" })], alignment:AlignmentType.CENTER, spacing:{before:0,after:80} }));
      children.push(new Paragraph({ children:[new TextRun({ text:"Faits constatés par les services de Gendarmerie Nationale et de Police Nationale", font:"Arial", size:20, italics:true, color:"64748B" })], alignment:AlignmentType.CENTER, spacing:{before:0,after:360} }));

      if (population || surface || densite) {
        children.push(mkTable(
          ["Population","Surface","Densité"],
          [[`${population?.toLocaleString()} habitants`, `${surface} km²`, `${densite} hab./km²`]],
          [3000,3000,3000]
        ));
      }

      // Saut de page
      children.push(new Paragraph({ children:[new PageBreak()], spacing:{before:0,after:0} }));

      // CHAPITRE 1
      children.push(mkH("CHAPITRE 1 — SYNTHÈSE EXÉCUTIVE", 1));
      children.push(mkP(`L'analyse des données de délinquance de la commune de ${commune} pour la période ${periode} révèle une tendance générale ${varGlobal===null?"":varGlobal<=0?"à la baisse":"à la hausse"} du nombre total de faits constatés${varGlobal!==null?` (${varGlobal>0?"+":""}${varGlobal}% par rapport à N-1)`:""}, avec cependant des évolutions très contrastées selon les catégories d'infraction.`, {after:180}));
      children.push(mkP(`Avec ${cumul??totalFaitsN} faits constatés sur l'ensemble de la période pour une population de ${population?.toLocaleString()} habitants, le taux de criminalité moyen s'établit à environ ${tauxMoyen}‰ faits pour 1 000 habitants.`, {after:240}));

      children.push(mkH3("Faits marquants de la période"));
      if (varGlobal!==null) children.push(mkBullet(`${varGlobal<=0?"Baisse":"Hausse"} globale de ${Math.abs(varGlobal)}% du total des faits constatés (${cumul??totalFaitsN} faits)`));
      if (sRoulotte>=10) children.push(mkBullet(`Phénomène dominant — Vols à la roulotte : ${sRoulotte} faits, pic en ${picRoulotte?.moisLabel} (${picRoulotte?.indicateurs.roulotte.valN} faits)`));
      if (sIncendies>0) children.push(mkBullet(`Émergence des incendies volontaires : ${sIncendies} fait${sIncendies>1?"s":""} enregistré${sIncendies>1?"s":""}`));
      if (sCambRes>=5) children.push(mkBullet(`Cambriolages résidentiels : ${sCambRes} faits — vigilance accrue recommandée`));

      // CHAPITRE 2
      children.push(mkH("CHAPITRE 2 — INDICATEURS GÉNÉRAUX ET ÉVOLUTION MENSUELLE", 1));
      children.push(mkH3("2.1 Évolution mensuelle des faits constatés"));
      children.push(mkP("Le tableau suivant présente l'évolution mensuelle du nombre de faits constatés, comparée au même mois de l'année N-1 :", {after:120}));
      children.push(mkTable(
        ["Mois","Faits N-1","Faits N","Variation","Cumul","Taux /1000 hab."],
        valid.map(f => {
          const ind = f.indicateurs.general_faits;
          return [f.moisLabel, ind.valN1??"-", ind.valN, ind.variationPct!==null?`${ind.variationPct>0?"+":""}${ind.variationPct}%`:"-", ind.cumul??"-", `${ind.taux}‰`];
        }),
        [1800,1300,1300,1300,1300,1400]
      ));
      children.push(blankLine());

      // CHAPITRE 3
      children.push(mkH("CHAPITRE 3 — ATTEINTES AUX PERSONNES", 1));
      children.push(mkH3("3.1 Coups et blessures volontaires"));
      children.push(mkP(sCbv>0?`Les coups et blessures volontaires représentent ${sCbv} fait${sCbv>1?"s":""} sur la période importée.`:"Aucun fait de coups et blessures volontaires n'est enregistré sur la période importée.", {after:120}));
      children.push(mkH3("3.2 Menaces et chantages"));
      children.push(mkP(sMenaces>0?`Les menaces et chantages représentent ${sMenaces} fait${sMenaces>1?"s":""} sur la période.`:"Aucun fait de menace ou chantage n'est enregistré sur la période importée.", {after:120}));

      // CHAPITRE 4
      children.push(mkH("CHAPITRE 4 — VOLS ET CAMBRIOLAGES", 1));
      children.push(mkH3("4.1 Vols simples"));
      children.push(mkP(`Les vols simples représentent ${sVolsSimp} faits sur la période.`, {after:120}));
      children.push(mkH3("4.2 Cambriolages"));
      children.push(mkP(`Les cambriolages de résidences représentent ${sCambRes} faits et les cambriolages de locaux professionnels ${sCambPro} faits sur la période.`, {after:240}));

      // CHAPITRE 5
      children.push(mkH("CHAPITRE 5 — DÉLINQUANCE LIÉE À L'AUTOMOBILE", 1));
      children.push(mkH3("5.1 Vols à la roulotte"));
      children.push(mkP(`Les vols à la roulotte constituent le phénomène le plus préoccupant de la période. Avec ${sRoulotte} faits, cette catégorie représente ${totalFaitsN>0?Math.round(sRoulotte/totalFaitsN*100):0}% de l'ensemble de la délinquance constatée.`, {after:120}));
      children.push(mkH3("5.2 Destructions de véhicules"));
      children.push(mkP(`Les destructions de véhicules privés comptabilisent ${sDestruc} fait${sDestruc>1?"s":""} sur la période.`, {after:240}));

      // CHAPITRE 6
      children.push(mkH("CHAPITRE 6 — AUTRES INFRACTIONS ET PHÉNOMÈNES ÉMERGENTS", 1));
      if ((sIncendies+sStupef+sAutorite)===0) {
        children.push(mkP("Aucun fait n'est enregistré dans les catégories Incendies, Stupéfiants et Atteintes à l'autorité sur la période importée.", {after:240}));
      } else {
        if (sIncendies>0) {
          children.push(mkH3("6.1 Incendies volontaires"));
          children.push(mkP(`L'émergence des incendies volontaires constitue l'une des évolutions les plus préoccupantes de la période. Avec ${sIncendies} fait${sIncendies>1?"s":""} constaté${sIncendies>1?"s":""}, ce phénomène s'est développé lors de : ${valid.filter(f=>(f.indicateurs.incendies.valN??0)>0).map(f=>`${f.moisLabel} (${f.indicateurs.incendies.valN})`).join(", ")}.`, {after:120}));
        }
        if (sStupef>0) {
          children.push(mkH3(`6.${sIncendies>0?2:1} Infractions stupéfiants`));
          children.push(mkP(`Les infractions stupéfiants représentent ${sStupef} fait${sStupef>1?"s":""} sur la période.`, {after:120}));
        }
      }

      // CHAPITRE 7 — Tableau récapitulatif
      children.push(mkH("CHAPITRE 7 — TABLEAU RÉCAPITULATIF COMPLET", 1));
      children.push(mkP(`Synthèse de tous les indicateurs — ${periode}`, {after:120}));
      const indKeys = Object.keys(valid[0].indicateurs);
      const moisHeaders = ["Indicateur", ...valid.map(f=>f.moisLabel.slice(0,3)), "Somme"];
      const moisColWidths = [2500, ...valid.map(()=>Math.max(600,Math.floor(5900/valid.length))), 700];
      const indRows = indKeys.map(k => {
        const vals = valid.map(f => f.indicateurs[k]?.valN ?? "—");
        const total = vals.reduce((s,v)=>s+(typeof v==="number"?v:0),0);
        return [valid[0].indicateurs[k].label, ...vals, k==="general_taux"?`Moy: ${(total/valid.length).toFixed(2)}`:total];
      });
      children.push(mkTable(moisHeaders, indRows, moisColWidths));
      children.push(blankLine());

      // CHAPITRE 8
      children.push(mkH("CHAPITRE 8 — RECOMMANDATIONS ET PRÉCONISATIONS", 1));
      if (sRoulotte>=10||sDestruc>=5||sIncendies>=3) {
        children.push(mkH3("🔴 8.1 Mesures prioritaires"));
        if (sRoulotte>=10) children.push(mkBullet(`Renforcement de la présence policière sur les zones de stationnement aux périodes à risque (${valid.filter(f=>(f.indicateurs.roulotte.valN??0)>=5).map(f=>f.moisLabel).join(", ")||"voir données"}).`));
        if (sRoulotte>=20) children.push(mkBullet("Installation ou amélioration de la vidéoprotection sur les principaux parkings de la commune."));
        if (sRoulotte>=10) children.push(mkBullet("Communication préventive auprès des résidents sur les bonnes pratiques de sécurisation des véhicules."));
        if (sDestruc>=5) children.push(mkBullet(`Suivi renforcé des destructions de véhicules (${sDestruc} faits). Envisager le renforcement de la vidéoprotection.`));
        if (sIncendies>=3) children.push(mkBullet(`Alerte incendies volontaires : ${sIncendies} faits. Coordination recommandée avec les services de prévention.`));
      }
      if (sCambRes>=5||(sIncendies>=1&&sIncendies<=2)) {
        children.push(mkH3("🟡 8.2 Mesures de vigilance renforcée"));
        if (sCambRes>=5) children.push(mkBullet(`Surveillance accrue des cambriolages résidentiels (${sCambRes} faits). Renforcer les rondes nocturnes.`));
        if (sIncendies>=1&&sIncendies<=2) children.push(mkBullet("Suivi du phénomène des incendies volontaires : établissement d'une cartographie des incidents."));
      }
      children.push(mkH3("🟢 8.3 Axes d'amélioration à moyen terme"));
      ["Déploiement d'une stratégie de prévention situationnelle ciblée sur les espaces de stationnement.",
       "Renforcement des dispositifs de participation citoyenne.",
       "Analyse comparative avec les communes voisines.",
       "Évaluation annuelle des effets des mesures mises en place."
      ].forEach(t => children.push(mkBullet(t)));

      // CHAPITRE 9
      children.push(mkH("CHAPITRE 9 — CONCLUSION", 1));
      if (varGlobal!==null) children.push(mkP(`La période ${periode} présente un bilan ${varGlobal<0?"positif":"préoccupant"} pour la commune de ${commune}. La ${varGlobal<0?"baisse":"hausse"} globale de ${Math.abs(varGlobal)}% du nombre de faits constatés constitue ${varGlobal<0?"indéniablement une évolution positive":"un signal d'alerte"} qui mérite une analyse approfondie.`, {after:180}));
      if ((sRoulotte+sDestruc)>0) children.push(mkP(`La délinquance automobile — notamment les vols à la roulotte (${sRoulotte} faits) et les destructions de véhicules (${sDestruc} faits) — s'impose comme le phénomène structurant de la période, nécessitant une réponse coordonnée.`, {after:180}));
      if (sIncendies>0) children.push(mkP(`L'émergence des incendies volontaires (${sIncendies} fait${sIncendies>1?"s":""}) constitue le signal le plus inquiétant de ce bilan et justifie une vigilance particulière dans les mois à venir.`, {after:180}));
      children.push(mkP(`Dans l'ensemble, le profil délinquantiel de ${commune} reste caractéristique d'une commune périurbaine : délinquance orientée vers le gain économique, criminalité grave limitée, mais vulnérabilité prononcée aux atteintes aux biens liées aux espaces de stationnement.`, {after:360}));

      // Pied de page
      children.push(new Paragraph({ children:[], border:{ top:{ style:BorderStyle.SINGLE, size:4, color:"E2E8F0", space:4 } }, spacing:{before:240,after:80} }));
      children.push(mkP(`Rapport établi à partir des données mensuelles de l'Observatoire de la Délinquance — GIP Ressources & Territoires`, {size:18, color:"94A3B8", after:40}));
      children.push(mkP(`Données Gendarmerie Nationale & Police Nationale — Population ${annee} : ${population?.toLocaleString()} habitants`, {size:18, color:"94A3B8", after:40}));
      children.push(mkP(`Rapport généré le ${today}`, {size:18, color:"94A3B8", italic:true, after:40}));

      // ── Création du document ────────────────────────────────
      const doc = new Document({
        numbering: { config: [{ reference:"bullets", levels:[{ level:0, format:LevelFormat.BULLET, text:"•", alignment:AlignmentType.LEFT, style:{ paragraph:{ indent:{ left:720, hanging:360 } } } }] }] },
        styles: {
          default: { document: { run: { font:"Arial", size:24 } } },
          paragraphStyles: [
            { id:"Heading1", name:"Heading 1", basedOn:"Normal", next:"Normal", quickFormat:true,
              run:{ size:28, bold:true, font:"Arial", color:"1E40AF" },
              paragraph:{ spacing:{ before:320, after:160 }, outlineLevel:0 } },
            { id:"Heading2", name:"Heading 2", basedOn:"Normal", next:"Normal", quickFormat:true,
              run:{ size:24, bold:true, font:"Arial", color:"334155" },
              paragraph:{ spacing:{ before:240, after:120 }, outlineLevel:1 } },
          ]
        },
        sections: [{
          properties: { page: { size:{ width:11906, height:16838 }, margin:{ top:1134, right:1134, bottom:1134, left:1134 } } },
          children
        }]
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rapport_Delinquance_${commune.replace(/ /g,"_")}_${annee}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDocxStatus("✓ Téléchargé !");
      setTimeout(() => setDocxStatus(""), 3000);
    } catch (err) {
      console.error("DOCX error:", err);
      setDocxStatus("❌ Erreur : " + err.message);
      setTimeout(() => setDocxStatus(""), 5000);
    }
  };

  return (
    <div>
      {/* Actions */}
      <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap",alignItems:"center"}}>
        <button onClick={copyReport} style={{
          padding:"10px 20px",background:THEME.colors.primary,color:"#fff",border:"none",
          borderRadius:THEME.radius.md,fontWeight:600,fontSize:13,cursor:"pointer",
          display:"flex",alignItems:"center",gap:8,transition:"opacity .15s",fontFamily:THEME.font
        }}>
          📋 {copyStatus || "Copier le rapport (texte brut)"}
        </button>
        <button onClick={printReport} style={{
          padding:"10px 20px",background:THEME.colors.surface,color:THEME.colors.text,
          border:`1px solid ${THEME.colors.border}`,borderRadius:THEME.radius.md,fontWeight:600,fontSize:13,cursor:"pointer",
          display:"flex",alignItems:"center",gap:8,fontFamily:THEME.font,boxShadow:THEME.shadow.card
        }}>
          🖨️ Imprimer / Exporter PDF
        </button>
        <button onClick={exportDocx} style={{
          padding:"10px 20px",background:THEME.colors.accent,color:"#fff",border:"none",
          borderRadius:THEME.radius.md,fontWeight:600,fontSize:13,cursor:"pointer",
          display:"flex",alignItems:"center",gap:8,fontFamily:THEME.font,boxShadow:"0 2px 8px rgba(13,148,136,.3)"
        }}>
          📄 {docxStatus || "Exporter Word (.docx)"}
        </button>
      </div>

      <div id="rapport-content" ref={reportContentRef} style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:"40px 48px",boxShadow:THEME.shadow.card,maxWidth:900,fontSize:14,lineHeight:1.7,color:THEME.colors.text,fontFamily:THEME.font}}>

        {/* PAGE DE COUVERTURE */}
        <div style={{textAlign:"center",paddingBottom:32,borderBottom:"3px solid #1E293B",marginBottom:36}}>
          <div style={{fontSize:13,fontWeight:600,color:"#64748B",letterSpacing:".12em",marginBottom:6}}>OBSERVATOIRE DE LA DÉLINQUANCE</div>
          <div style={{fontSize:22,fontWeight:800,color:"#1E293B",marginBottom:4}}>COMMUNE DE {commune.toUpperCase()}</div>
          <div style={{fontSize:16,fontWeight:600,color:"#3B82F6",marginBottom:20}}>RAPPORT D'ANALYSE CRIMINOLOGIQUE — {annee}</div>
          <div style={{fontSize:12,color:"#64748B",marginBottom:20,fontStyle:"italic"}}>
            Réalisé à partir des données mensuelles de l'Observatoire de la Délinquance<br/>
            Faits constatés par les services de Gendarmerie Nationale et de Police Nationale
          </div>
          <div style={{display:"inline-grid",gridTemplateColumns:"repeat(3,1fr)",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",fontSize:13}}>
            {[["Population",`${population.toLocaleString()} habitants`],["Surface",`${surface} km²`],["Densité",`${densite} hab./km²`]].map(([l,v])=>(
              <div key={l} style={{padding:"14px 24px",textAlign:"center",borderRight:"1px solid #E2E8F0"}}>
                <div style={{color:"#64748B",fontWeight:600,marginBottom:4}}>{l}</div>
                <div style={{fontWeight:700,color:"#1E293B"}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CHAPITRE 1 */}
        <h2 style={{...h2Style,color:"#1E40AF",borderBottomColor:"#BFDBFE"}}>CHAPITRE 1 — SYNTHÈSE EXÉCUTIVE</h2>

        <p>
          L'analyse des données de délinquance de la commune de <strong>{commune}</strong> pour la période <strong>{periode}</strong>{" "}
          révèle une tendance générale{" "}
          <strong>{varGlobal === null ? "" : varGlobal <= 0 ? "à la baisse" : "à la hausse"}</strong>{" "}
          du nombre total de faits constatés
          {varGlobal !== null ? ` (${varGlobal > 0 ? "+" : ""}${varGlobal}% par rapport à N-1)` : ""},{" "}
          avec cependant des évolutions très contrastées selon les catégories d'infraction.
        </p>

        <p>
          Avec <strong>{cumul ?? totalFaitsN}</strong> faits constatés sur l'ensemble de la période pour une population de{" "}
          <strong>{population.toLocaleString()}</strong> habitants, le taux de criminalité moyen s'établit à environ{" "}
          <strong>{tauxMoyen}‰</strong> faits pour 1 000 habitants.
        </p>

        <h3 style={h3Style}>Faits marquants de la période</h3>
        <ul style={{paddingLeft:20}}>
          {varGlobal !== null && <li><strong>{varGlobal <= 0 ? "Baisse" : "Hausse"} globale de {Math.abs(varGlobal)}%</strong> du total des faits constatés ({cumul ?? totalFaitsN} faits)</li>}
          {sRoulotte >= 10 && <li><strong>Phénomène dominant — Vols à la roulotte :</strong> {sRoulotte} faits sur la période, avec un pic en {picRoulotte?.moisLabel} ({picRoulotte?.indicateurs.roulotte.valN} faits)</li>}
          {sIncendies > 0 && <li><strong>Émergence des incendies volontaires :</strong> {sIncendies} fait{sIncendies>1?"s":""} enregistré{sIncendies>1?"s":""}</li>}
          {sCambRes >= 5 && <li><strong>Cambriolages résidentiels :</strong> {sCambRes} faits — vigilance accrue recommandée</li>}
          {varGlobal !== null && varGlobal < 0 && <li><strong>Recul notable du total :</strong> {varGlobal}% vs N-1</li>}
        </ul>

        {/* CHAPITRE 2 */}
        <h2 style={h2Style}>CHAPITRE 2 — INDICATEURS GÉNÉRAUX ET ÉVOLUTION MENSUELLE</h2>
        <h3 style={h3Style}>2.1 Évolution mensuelle des faits constatés</h3>
        <p>Le tableau suivant présente l'évolution mensuelle du nombre de faits constatés en {annee}, comparée au même mois de l'année N-1 :</p>

        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:16}}>
            <thead>
              <tr>{["Mois","Faits N-1","Faits N","Variation","Cumul","Taux /1000 hab."].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {valid.map((f,i)=>{
                const ind = f.indicateurs.general_faits;
                return (
                  <tr key={i}>
                    <td style={tdStyle()}><strong>{f.moisLabel}</strong></td>
                    <td style={tdStyle()}>{ind.valN1 ?? "—"}</td>
                    <td style={tdStyle(ind.valN)}><strong>{ind.valN}</strong></td>
                    <td style={{...tdStyle(),color:variationColor(ind.variationPct),fontWeight:600}}>
                      {ind.variationPct !== null ? `${ind.variationPct > 0 ? "+" : ""}${ind.variationPct}%` : "—"}
                    </td>
                    <td style={tdStyle()}>{ind.cumul ?? "—"}</td>
                    <td style={tdStyle()}>{ind.taux}‰</td>
                  </tr>
                );
              })}
              <tr style={{background:"#EFF6FF"}}>
                <td style={{...tdStyle(),fontWeight:700}}>TOTAL</td>
                <td style={{...tdStyle(),fontWeight:700}}>{totalFaitsN1 || "—"}</td>
                <td style={{...tdStyle(),fontWeight:700}}>{totalFaitsN}</td>
                <td style={{...tdStyle(),fontWeight:700,color:variationColor(varGlobal)}}>{varGlobal !== null ? `${varGlobal > 0 ? "+" : ""}${varGlobal}%` : "—"}</td>
                <td style={{...tdStyle(),fontWeight:700}}>{cumul}</td>
                <td style={{...tdStyle(),fontWeight:700}}>Moy : {tauxMoyen}‰</td>
              </tr>
            </tbody>
          </table>
        </div>

        {trimData.length >= 2 && (
          <>
            <h3 style={h3Style}>2.2 Analyse saisonnière</h3>
            <p>L'analyse par trimestre met en lumière une concentration de la délinquance sur la période :</p>
            <ul style={{paddingLeft:20}}>
              {trimData.map(t=>(
                <li key={t.t}>T{t.t} ({t.mois.join(", ")}) : <strong>{t.total} faits</strong> — {totalFaitsN>0?Math.round(t.total/totalFaitsN*100):0}% du total.</li>
              ))}
            </ul>
            {(() => {
              const picTrim = trimData.reduce((b,t)=>t.total>b.total?t:b,trimData[0]);
              return <p><strong>Ce bilan confirme une concentration sur T{picTrim.t}</strong> ({picTrim.mois.join(", ")}) avec {picTrim.total} faits ({totalFaitsN>0?Math.round(picTrim.total/totalFaitsN*100):0}% du total). Le mois le plus actif reste {picFaits?.moisLabel} avec {picFaits?.indicateurs.general_faits.valN} faits (taux {picFaits?.indicateurs.general_faits.taux}‰).</p>;
            })()}
          </>
        )}

        {/* CHAPITRE 3 */}
        <h2 style={h2Style}>CHAPITRE 3 — ATTEINTES AUX PERSONNES</h2>
        <h3 style={h3Style}>3.1 Coups et blessures volontaires</h3>
        {sCbv > 0 ? (
          <p>Les coups et blessures volontaires représentent <strong>{sCbv} fait{sCbv>1?"s":""}</strong> sur la période importée.{" "}
          {(() => {
            const picCbv = valid.reduce((b,f)=>(f.indicateurs.cbv.valN??0)>(b.indicateurs.cbv.valN??0)?f:b, valid[0]);
            const avgCbv = sCbv / valid.length;
            return sCbv > 0 && (picCbv.indicateurs.cbv.valN ?? 0) > avgCbv * 1.5 ? ` L'analyse mensuelle révèle un pic important en ${picCbv.moisLabel} (${picCbv.indicateurs.cbv.valN} faits).` : "";
          })()}</p>
        ) : (
          <p>Aucun fait de coups et blessures volontaires n'est enregistré sur la période importée.</p>
        )}

        <h3 style={h3Style}>3.2 Menaces et chantages</h3>
        {sMenaces > 0 ? (
          <p>Les menaces et chantages représentent <strong>{sMenaces} fait{sMenaces>1?"s":""}</strong> sur la période.</p>
        ) : (
          <p>Aucun fait de menace ou chantage n'est enregistré sur la période importée.</p>
        )}

        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:12,marginBottom:8}}>
          <thead><tr>{["Catégorie","Cumul période","Tendance"].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {[["Coups et blessures volontaires",sCbv],["Menaces ou chantages",sMenaces],["Vols avec violence sans arme",0],["Vols à main armée",0]].map(([l,v])=>(
              <tr key={l}><td style={tdStyle()}>{l}</td><td style={tdStyle(v)}>{v} faits</td><td style={tdStyle()}>{v>0?"Présent":"Nul"}</td></tr>
            ))}
            <tr style={{background:"#EFF6FF"}}>
              <td style={{...tdStyle(),fontWeight:700}}>TOTAL atteintes aux personnes</td>
              <td style={{...tdStyle(),fontWeight:700}}>{sCbv+sMenaces} faits</td>
              <td style={tdStyle()}>—</td>
            </tr>
          </tbody>
        </table>

        {/* CHAPITRE 4 */}
        <h2 style={h2Style}>CHAPITRE 4 — VOLS ET CAMBRIOLAGES</h2>
        <h3 style={h3Style}>4.1 Vols simples</h3>
        <p>Les vols simples représentent <strong>{sVolsSimp} faits</strong> sur la période.
        {(() => {
          const picVols = valid.reduce((b,f)=>(f.indicateurs.vols_simples.valN??0)>(b.indicateurs.vols_simples.valN??0)?f:b, valid[0]);
          const avgVols = sVolsSimp/valid.length;
          return (picVols.indicateurs.vols_simples.valN??0) > avgVols*2 ? ` Un pic exceptionnel est observé en ${picVols.moisLabel} avec ${picVols.indicateurs.vols_simples.valN} faits.` : "";
        })()}</p>

        <h3 style={h3Style}>4.2 Cambriolages</h3>
        <p>Les cambriolages de résidences représentent <strong>{sCambRes} faits</strong>{" "}
        et les cambriolages de locaux professionnels <strong>{sCambPro} faits</strong> sur la période.</p>

        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:12,marginBottom:8}}>
          <thead><tr>{["Catégorie","Cumul période","Variation","Niveau alerte"].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {[["Vols simples",sVolsSimp,null],["Cambriolages résidentiels",sCambRes,null],["Cambriolages locaux pro.",sCambPro,null],["Vols à la roulotte",sRoulotte,null]].map(([l,v,p])=>(
              <tr key={l}><td style={tdStyle()}>{l}</td><td style={tdStyle(v)}>{v} faits</td><td style={tdStyle()}>—</td><td style={tdStyle()}>{alertEmoji(p)}</td></tr>
            ))}
          </tbody>
        </table>

        {/* CHAPITRE 5 */}
        <h2 style={h2Style}>CHAPITRE 5 — DÉLINQUANCE LIÉE À L'AUTOMOBILE</h2>
        <h3 style={h3Style}>5.1 Vols à la roulotte — phénomène dominant</h3>
        <p>
          Les vols à la roulotte et d'accessoires constituent le phénomène le plus préoccupant de la période.
          Avec <strong>{sRoulotte} faits</strong>, cette catégorie représente à elle seule{" "}
          <strong>{totalFaitsN > 0 ? Math.round(sRoulotte/totalFaitsN*100) : 0}%</strong> de l'ensemble de la délinquance constatée.
          {sRoulotte > 0 && (() => {
            const peaks = valid.filter(f=>(f.indicateurs.roulotte.valN??0)>=5);
            return peaks.length >= 2 ? ` L'analyse révèle des pics significatifs en ${peaks.map(f=>`${f.moisLabel} (${f.indicateurs.roulotte.valN})`).join(", ")}.` : "";
          })()}
        </p>

        <h3 style={h3Style}>5.2 Destructions de véhicules</h3>
        <p>Les destructions de véhicules privés comptabilisent <strong>{sDestruc} fait{sDestruc>1?"s":""}</strong> sur la période.</p>

        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:12,marginBottom:8}}>
          <thead><tr>{["Catégorie","Cumul période","Analyse"].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {[["Vols à la roulotte & accessoires",sRoulotte],["Destructions véhicules privés",sDestruc],["Total délinquance auto",sRoulotte+sDestruc]].map(([l,v],i)=>(
              <tr key={l} style={i===2?{background:"#EFF6FF"}:{}}>
                <td style={{...tdStyle(),fontWeight:i===2?700:400}}>{l}</td>
                <td style={{...tdStyle(v),fontWeight:i===2?700:400}}>{v} faits</td>
                <td style={tdStyle()}>{i===2?`${totalFaitsN>0?Math.round((sRoulotte+sDestruc)/totalFaitsN*100):0}% du total`:sRoulotte>10?"🔴 Prioritaire":sRoulotte>0?"🟡 Vigilance":"🟢"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* CHAPITRE 6 */}
        <h2 style={h2Style}>CHAPITRE 6 — AUTRES INFRACTIONS ET PHÉNOMÈNES ÉMERGENTS</h2>
        {(sIncendies + sStupef + sAutorite) === 0 ? (
          <p>Aucun fait n'est enregistré dans les catégories Incendies, Stupéfiants et Atteintes à l'autorité sur la période importée.</p>
        ) : (
          <>
            {sIncendies > 0 && (
              <>
                <h3 style={h3Style}>6.1 Incendies volontaires — phénomène émergent</h3>
                <p>
                  L'émergence des incendies volontaires de biens publics et privés constitue l'une des évolutions les plus préoccupantes de la période.
                  Avec <strong>{sIncendies} fait{sIncendies>1?"s":""} constaté{sIncendies>1?"s":""}</strong>, ce phénomène s'est développé lors de :{" "}
                  {valid.filter(f=>(f.indicateurs.incendies.valN??0)>0).map(f=>`${f.moisLabel} (${f.indicateurs.incendies.valN})`).join(", ")}.
                </p>
              </>
            )}
            {sStupef > 0 && (
              <>
                <h3 style={h3Style}>6.{sIncendies>0?2:1} Infractions à la législation sur les stupéfiants</h3>
                <p>
                  Les infractions stupéfiants représentent <strong>{sStupef} fait{sStupef>1?"s":""}</strong> sur la période.
                  Ce chiffre dépend fortement de l'intensité des contrôles réalisés par les forces de l'ordre.
                </p>
              </>
            )}
            {sAutorite > 0 && (
              <>
                <h3 style={h3Style}>6.{sIncendies>0&&sStupef>0?3:sIncendies>0||sStupef>0?2:1} Atteintes à l'autorité</h3>
                <p>Les atteintes à l'autorité représentent <strong>{sAutorite} fait{sAutorite>1?"s":""}</strong> sur la période.</p>
              </>
            )}
          </>
        )}

        {/* CHAPITRE 7 */}
        <h2 style={h2Style}>CHAPITRE 7 — TABLEAU RÉCAPITULATIF COMPLET</h2>
        <p style={{marginBottom:12}}>Synthèse de tous les indicateurs — {periode}</p>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr>
                <th style={{...thStyle,minWidth:180}}>Indicateur</th>
                {valid.map(f=><th key={f.mois} style={{...thStyle,minWidth:80}}>{f.moisLabel.slice(0,3)}</th>)}
                <th style={{...thStyle,minWidth:70}}>Somme</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(valid[0].indicateurs).map(([k,ind])=>{
                const vals = valid.map(f=>f.indicateurs[k]?.valN);
                const total = vals.reduce((s,v)=>s+(v??0),0);
                return (
                  <tr key={k}>
                    <td style={tdStyle()}>{ind.label}</td>
                    {vals.map((v,i)=><td key={i} style={{...tdStyle(v),textAlign:"right"}}>{v ?? "—"}</td>)}
                    <td style={{...tdStyle(total),textAlign:"right",fontWeight:700}}>{k==="general_taux"?`Moy: ${(total/valid.length).toFixed(2)}`:total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* CHAPITRE 8 */}
        <h2 style={h2Style}>CHAPITRE 8 — RECOMMANDATIONS ET PRÉCONISATIONS</h2>

        {(sRoulotte >= 10 || sDestruc >= 5 || sIncendies >= 3) && (
          <>
            <h3 style={{...h3Style,color:"#DC2626"}}>🔴 8.1 Mesures prioritaires</h3>
            <ul style={{paddingLeft:20}}>
              {sRoulotte >= 10 && <li>Renforcement de la présence policière sur les zones de stationnement aux périodes à risque ({valid.filter(f=>(f.indicateurs.roulotte.valN??0)>=5).map(f=>f.moisLabel).join(", ")||"voir données"}). Les données indiquent clairement des pics d'activité qui permettent d'orienter efficacement les patrouilles.</li>}
              {sRoulotte >= 20 && <li>Installation ou amélioration de la vidéoprotection sur les principaux parkings de la commune.</li>}
              {sRoulotte >= 10 && <li>Communication préventive auprès des résidents sur les bonnes pratiques de sécurisation des véhicules.</li>}
              {sRoulotte >= 20 && <li>Coordination renforcée avec les communes voisines pour détecter les potentiels réseaux itinérants.</li>}
              {sDestruc >= 5 && <li>Suivi renforcé des destructions de véhicules ({sDestruc} faits). Envisager le renforcement de la vidéoprotection.</li>}
              {sIncendies >= 3 && <li>Alerte incendies volontaires : {sIncendies} faits. Coordination recommandée avec les services de prévention.</li>}
            </ul>
          </>
        )}

        {(sCambRes >= 5 || (sIncendies >= 1 && sIncendies <= 2)) && (
          <>
            <h3 style={{...h3Style,color:"#D97706"}}>🟡 8.2 Mesures de vigilance renforcée</h3>
            <ul style={{paddingLeft:20}}>
              {sCambRes >= 5 && <li>Surveillance accrue des cambriolages résidentiels ({sCambRes} faits). Renforcer les rondes nocturnes, particulièrement en automne.</li>}
              {sIncendies >= 1 && sIncendies <= 2 && <li>Suivi du phénomène des incendies volontaires : établissement d'une cartographie des incidents.</li>}
            </ul>
          </>
        )}

        <h3 style={{...h3Style,color:"#16A34A"}}>🟢 8.3 Axes d'amélioration à moyen terme</h3>
        <ul style={{paddingLeft:20}}>
          <li>Déploiement d'une stratégie de prévention situationnelle ciblée sur les espaces de stationnement (éclairage, signalétique, aménagement dissuasif).</li>
          <li>Renforcement des dispositifs de participation citoyenne.</li>
          <li>Analyse comparative avec les communes voisines.</li>
          <li>Évaluation annuelle des effets des mesures mises en place.</li>
        </ul>

        {/* CHAPITRE 9 */}
        <h2 style={h2Style}>CHAPITRE 9 — CONCLUSION</h2>

        {varGlobal !== null && (
          <p>
            La période <strong>{periode}</strong> présente un bilan <strong>{varGlobal < 0 ? "positif" : "préoccupant"}</strong> pour la commune de {commune}.
            La {varGlobal < 0 ? "baisse" : "hausse"} globale de <strong>{Math.abs(varGlobal)}%</strong> du nombre de faits constatés constitue{" "}
            {varGlobal < 0 ? "indéniablement une évolution positive" : "un signal d'alerte"} qui mérite une analyse approfondie.
          </p>
        )}

        {(sRoulotte + sDestruc) > 0 && (
          <p>
            Cette évolution ne doit pas masquer des dynamiques préoccupantes. La délinquance automobile — notamment les vols à la roulotte{" "}
            (<strong>{sRoulotte} faits</strong>) et les destructions de véhicules (<strong>{sDestruc} faits</strong>) — s'impose comme le phénomène structurant de la période, nécessitant une réponse coordonnée.
          </p>
        )}

        {sIncendies > 0 && (
          <p>
            L'émergence des incendies volontaires (<strong>{sIncendies} fait{sIncendies>1?"s":""}</strong>) constitue le signal le plus inquiétant de ce bilan et justifie une vigilance particulière dans les mois à venir.
          </p>
        )}

        <p>
          Dans l'ensemble, le profil délinquantiel de <strong>{commune}</strong> reste caractéristique d'une commune périurbaine : délinquance orientée vers le gain économique, criminalité grave limitée, mais vulnérabilité prononcée aux atteintes aux biens liées aux espaces de stationnement. Les leviers d'action sont identifiés ; leur mise en œuvre déterminera l'évolution de la situation en {annee + 1}.
        </p>

        {/* Pied de page */}
        <div style={{marginTop:40,paddingTop:16,borderTop:"1px solid #E2E8F0",fontSize:11,color:"#94A3B8",lineHeight:2}}>
          Rapport établi à partir des données mensuelles de l'Observatoire de la Délinquance — GIP Ressources & Territoires<br/>
          Données Gendarmerie Nationale & Police Nationale<br/>
          Population {annee} : {population.toLocaleString()} habitants<br/>
          Fichiers importés : {fichiersList}<br/>
          Rapport généré le {today}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VUE COMPARAISON
// Données 100 % réelles (parsedFiles). Comparaison mois/mois, plusieurs mois, années complètes.
// Export : copie, impression, Word, mode expert.
// ─────────────────────────────────────────────────────────────
const INDICATOR_KEYS_ORDER = ["general_faits","general_taux","cbv","menaces","vols_simples","camb_resid","camb_pro","roulotte","destruc_veh","incendies","stupef","autorite"];

function ViewComparaison({ parsedFiles }) {
  const valid = useMemo(() => parsedFiles.filter(f => !f.erreur).sort((a,b) => a.annee !== b.annee ? a.annee - b.annee : a.mois - b.mois), [parsedFiles]);
  const entryKey = (f) => `${f.mois}-${f.annee}`;
  const years = useMemo(() => [...new Set(valid.map(f => f.annee))].sort((a,b) => a - b), [valid]);
  const byYear = useMemo(() => {
    const o = {};
    years.forEach(y => { o[y] = valid.filter(f => f.annee === y); });
    return o;
  }, [valid, years]);

  const [selectedA, setSelectedA] = useState(new Set());
  const [selectedB, setSelectedB] = useState(new Set());
  const [copyStatus, setCopyStatus] = useState("");
  const [docxStatus, setDocxStatus] = useState("");
  const reportRef = useRef(null);

  const entriesA = useMemo(() => valid.filter(f => selectedA.has(entryKey(f))), [valid, selectedA]);
  const entriesB = useMemo(() => valid.filter(f => selectedB.has(entryKey(f))), [valid, selectedB]);

  const toggleA = (key) => setSelectedA(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleB = (key) => setSelectedB(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const selectYearA = (y) => setSelectedA(prev => { const n = new Set(prev); byYear[y].forEach(f => n.add(entryKey(f))); return n; });
  const selectYearB = (y) => setSelectedB(prev => { const n = new Set(prev); byYear[y].forEach(f => n.add(entryKey(f))); return n; });
  const clearA = () => setSelectedA(new Set());
  const clearB = () => setSelectedB(new Set());

  const totalA = useMemo(() => entriesA.reduce((s,f) => s + (f.indicateurs.general_faits.valN ?? 0), 0), [entriesA]);
  const totalB = useMemo(() => entriesB.reduce((s,f) => s + (f.indicateurs.general_faits.valN ?? 0), 0), [entriesB]);
  const tauxMoyA = useMemo(() => entriesA.length ? entriesA.reduce((s,f) => s + (Number(f.indicateurs.general_faits.taux) || 0), 0) / entriesA.length : null, [entriesA]);
  const tauxMoyB = useMemo(() => entriesB.length ? entriesB.reduce((s,f) => s + (Number(f.indicateurs.general_faits.taux) || 0), 0) / entriesB.length : null, [entriesB]);
  const ecartPct = totalB > 0 ? Math.round((totalA - totalB) / totalB * 100) : (totalA > 0 ? 100 : null);

  const comparisonRows = useMemo(() => {
    const rows = [];
    const indMap = valid[0]?.indicateurs;
    if (!indMap) return rows;
    INDICATOR_KEYS_ORDER.forEach(k => {
      const ind = indMap[k];
      if (!ind) return;
      const isTaux = k === "general_taux";
      let sumA, sumB;
      if (isTaux) {
        sumA = entriesA.length ? entriesA.reduce((s,f) => s + (Number(f.indicateurs[k]?.valN) || 0), 0) / entriesA.length : null;
        sumB = entriesB.length ? entriesB.reduce((s,f) => s + (Number(f.indicateurs[k]?.valN) || 0), 0) / entriesB.length : null;
      } else {
        sumA = entriesA.reduce((s,f) => s + (f.indicateurs[k]?.valN ?? 0), 0);
        sumB = entriesB.reduce((s,f) => s + (f.indicateurs[k]?.valN ?? 0), 0);
      }
      const pct = (sumB != null && sumB > 0 && sumA != null) ? Math.round((sumA - sumB) / sumB * 100) : (sumA != null && sumA > 0 && (sumB == null || sumB === 0) ? 100 : null);
      rows.push({ key: k, label: ind.label, cat: ind.cat, sumA, sumB, pct, isTaux });
    });
    return rows;
  }, [valid, entriesA, entriesB]);

  const labelPeriod = (entries) => {
    if (entries.length === 0) return "—";
    if (entries.length === 1) return `${entries[0].moisLabel} ${entries[0].annee}`;
    const yearsUniq = [...new Set(entries.map(f => f.annee))];
    if (yearsUniq.length === 1) return `${entries[0].moisLabel} — ${entries[entries.length-1].moisLabel} ${yearsUniq[0]} (${entries.length} mois)`;
    return `${entries[0].moisLabel} ${entries[0].annee} — ${entries[entries.length-1].moisLabel} ${entries[entries.length-1].annee} (${entries.length} mois)`;
  };

  const chartCompareData = useMemo(() => {
    const cats = [...new Set(comparisonRows.map(r => r.cat))].filter(Boolean);
    return cats.map(cat => {
      const rows = comparisonRows.filter(r => r.cat === cat && !r.isTaux);
      const sumA = rows.reduce((s,r) => s + (r.sumA ?? 0), 0);
      const sumB = rows.reduce((s,r) => s + (r.sumB ?? 0), 0);
      return { cat, "Période A": sumA, "Période B": sumB };
    }).filter(d => d["Période A"] > 0 || d["Période B"] > 0);
  }, [comparisonRows]);

  const categoryTableRows = useMemo(() => {
    return chartCompareData.map(d => {
      const a = d["Période A"] ?? 0;
      const b = d["Période B"] ?? 0;
      const pct = b > 0 ? Math.round((a - b) / b * 100) : (a > 0 ? 100 : null);
      return { cat: d.cat, sumA: a, sumB: b, pct };
    });
  }, [chartCompareData]);

  const synthesisText = useMemo(() => {
    if (entriesA.length === 0 || entriesB.length === 0) return "";
    const commune = valid[0]?.commune ?? "—";
    const labA = labelPeriod(entriesA);
    const labB = labelPeriod(entriesB);
    const ecart = ecartPct != null ? `soit une évolution de ${ecartPct > 0 ? "+" : ""}${ecartPct}% entre les deux périodes.` : "";
    const tauxPhrase = (tauxMoyA != null && tauxMoyB != null) ? ` Taux moyen pour 1 000 habitants : ${tauxMoyA.toFixed(2)}‰ (période A) et ${tauxMoyB.toFixed(2)}‰ (période B).` : "";
    return `Comparaison des données de délinquance pour ${commune}. Période A (${labA}) : ${totalA} faits constatés. Période B (${labB}) : ${totalB} faits constatés. ${ecart}${tauxPhrase}`;
  }, [entriesA, entriesB, valid, totalA, totalB, ecartPct, tauxMoyA, tauxMoyB, labelPeriod]);

  const buildReportText = (modeExpert) => {
    const commune = valid[0]?.commune ?? "—";
    const lines = [
      "OBSERVATOIRE DE LA DÉLINQUANCE",
      "RAPPORT DE COMPARAISON DE PÉRIODES",
      `Commune : ${commune}`,
      "",
      "——— PAGE DE COUVERTURE ———",
      "Période A : " + labelPeriod(entriesA),
      entriesA.length ? "Mois inclus : " + entriesA.map(f => f.moisLabel + " " + f.annee).join(", ") : "Aucun",
      `Total faits constatés : ${totalA}`,
      tauxMoyA != null ? `Taux moyen pour 1 000 hab. : ${tauxMoyA.toFixed(2)} ‰` : "",
      "",
      "Période B : " + labelPeriod(entriesB),
      entriesB.length ? "Mois inclus : " + entriesB.map(f => f.moisLabel + " " + f.annee).join(", ") : "Aucun",
      `Total faits constatés : ${totalB}`,
      tauxMoyB != null ? `Taux moyen pour 1 000 hab. : ${tauxMoyB.toFixed(2)} ‰` : "",
      "",
      "Écart global (A vs B) : " + (ecartPct != null ? (ecartPct > 0 ? "+" : "") + ecartPct + "%" : "—"),
      "",
      "——— CHAPITRE 1 — SYNTHÈSE EXÉCUTIVE ———",
      synthesisText,
      ecartPct != null ? `L'écart global entre les deux périodes s'établit à ${ecartPct > 0 ? "+" : ""}${ecartPct}%${ecartPct > 0 ? " : la période A enregistre davantage de faits constatés que la période B." : ecartPct < 0 ? " : la période A enregistre moins de faits que la période B." : " : les deux périodes sont à égalité."}` : "",
      "",
      "——— CHAPITRE 2 — COMPARAISON PAR CATÉGORIE ———",
      "2.1 Tableau récapitulatif par catégorie",
      "Catégorie | Période A | Période B | Écart %",
      ...categoryTableRows.map(r => `${r.cat} | ${r.sumA} | ${r.sumB} | ${r.pct != null ? (r.pct > 0 ? "+" : "") + r.pct + "%" : "—"}`),
      "",
      "——— CHAPITRE 3 — TABLEAU COMPARATIF DÉTAILLÉ ———",
      "3.1 Tous les indicateurs",
      "Indicateur | Catégorie | Période A | Période B | Écart %",
      ...comparisonRows.map(r => {
        const a = r.isTaux && r.sumA != null ? `${Number(r.sumA).toFixed(2)} ‰` : r.sumA;
        const b = r.isTaux && r.sumB != null ? `${Number(r.sumB).toFixed(2)} ‰` : r.sumB;
        return `${r.label} | ${r.cat ?? "—"} | ${a} | ${b} | ${r.pct != null ? (r.pct > 0 ? "+" : "") + r.pct + "%" : "—"}`;
      }),
      "Synthèse (faits constatés) | | " + totalA + " faits | " + totalB + " faits | " + (ecartPct != null ? (ecartPct > 0 ? "+" : "") + ecartPct + "%" : "—"),
      "",
      "3.2 Indicateurs détaillés par catégorie",
    ];
    const cats = [...new Set(comparisonRows.map(r => r.cat).filter(Boolean))];
    cats.forEach(cat => {
      lines.push("", "Catégorie : " + cat, "Indicateur | Période A | Période B | Écart %");
      comparisonRows.filter(r => r.cat === cat).forEach(r => {
        const a = r.isTaux && r.sumA != null ? `${Number(r.sumA).toFixed(2)} ‰` : r.sumA;
        const b = r.isTaux && r.sumB != null ? `${Number(r.sumB).toFixed(2)} ‰` : r.sumB;
        lines.push(`${r.label} | ${a} | ${b} | ${r.pct != null ? (r.pct > 0 ? "+" : "") + r.pct + "%" : "—"}`);
      });
    });
    lines.push(
      "",
      "——— CHAPITRE 4 — CONCLUSION ———",
      `La comparaison des périodes ${labelPeriod(entriesA)} (période A) et ${labelPeriod(entriesB)} (période B) pour la commune de ${commune} montre un total de ${totalA} faits constatés sur la période A et ${totalB} faits sur la période B.`,
      ecartPct != null ? `L'évolution entre les deux périodes est de ${ecartPct > 0 ? "+" : ""}${ecartPct}%. ` : "",
      "Les données utilisées proviennent exclusivement des rapports mensuels de l'Observatoire de la Délinquance ; aucune donnée synthétique ou estimée n'a été utilisée.",
      "",
      "——— PIED DE PAGE ———",
      "Rapport établi à partir des données mensuelles de l'Observatoire de la Délinquance — GIP Ressources & Territoires",
      "Période A : " + (entriesA.length ? entriesA.map(f => f.moisLabel + " " + f.annee).join(", ") : "—"),
      "Période B : " + (entriesB.length ? entriesB.map(f => f.moisLabel + " " + f.annee).join(", ") : "—"),
    );
    if (modeExpert) {
      const dateGen = new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "medium" });
      const nbFichiers = new Set([...entriesA, ...entriesB].map(f => f.fichierSource)).size;
      lines.push(
        "", "——— ANNEXES — MODE EXPERT ———",
        "A. MÉTADONNÉES ET TRAÇABILITÉ",
        `Date et heure de génération : ${dateGen}`,
        `Commune : ${commune}`,
        `Période A : ${entriesA.length} mois — Total ${totalA} faits${tauxMoyA != null ? ` — Taux moyen ${tauxMoyA.toFixed(2)} ‰` : ""}`,
        `Période B : ${entriesB.length} mois — Total ${totalB} faits${tauxMoyB != null ? ` — Taux moyen ${tauxMoyB.toFixed(2)} ‰` : ""}`,
        `Écart global : ${ecartPct != null ? (ecartPct > 0 ? "+" : "") + ecartPct + " %" : "—"}`,
        `Fichiers sources distincts : ${nbFichiers}`,
        "",
        "B. DÉTAIL DES MOIS INCLUS",
        "Mois | Année | Période | Faits du mois | Fichier source"
      );
      [...entriesA.map(f => [f.moisLabel, f.annee, "A", f.indicateurs?.general_faits?.valN ?? "—", f.fichierSource ?? "—"]), ...entriesB.map(f => [f.moisLabel, f.annee, "B", f.indicateurs?.general_faits?.valN ?? "—", f.fichierSource ?? "—"])].forEach(row => lines.push(row.join(" | ")));
      lines.push(
        "", "C. MÉTHODOLOGIE ET FORMULES",
        "Source : rapports mensuels Observatoire de la délinquance (OND), GIP Ressources & Territoires. Faits constatés Gendarmerie et Police.",
        "Écart % = (Total A − Total B) / Total B × 100. Taux moyen = moyenne arithmétique des taux mensuels pour 1 000 habitants.",
        "Arrondis : pourcentages entiers, taux 2 décimales.",
        "",
        "D. RÉFÉRENTIEL DES INDICATEURS",
        "Code | Libellé | Catégorie | Type"
      );
      comparisonRows.forEach(r => lines.push(`${r.key} | ${r.label} | ${r.cat ?? "—"} | ${r.isTaux ? "Taux ‰" : "Volume"}`));
      lines.push(
        "", "E. NOTES TECHNIQUES ET LIMITES",
        "Données extraites des PDFs ; cohérence dépend du parsing. Population = celle du rapport mensuel. Catégories = regroupement standard OND. Document à usage d'analyse et reproductibilité."
      );
    }
    return lines.filter(Boolean).join("\n");
  };

  const copyReport = async () => {
    const text = (reportRef.current?.innerText?.trim()) || buildReportText(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("✓ Copié");
      setTimeout(() => setCopyStatus(""), 2500);
    } catch (e) {
      setCopyStatus("❌ Échec");
      setTimeout(() => setCopyStatus(""), 3000);
    }
  };

  const printReport = () => {
    const el = reportRef.current;
    if (!el) return;
    const style = document.createElement("style");
    style.id = "print-style-comparaison";
    style.textContent = `
      @media print {
        body > *:not(#comparaison-print) { display: none !important; }
        #comparaison-print { display: block !important; position: static !important; width: 100% !important; max-width: 100% !important; min-height: 0 !important; height: auto !important; overflow: visible !important; background: #fff !important; padding: 20px !important; box-shadow: none !important; }
        #comparaison-print * { box-shadow: none !important; }
        @page { margin: 1.5cm; }
      }
    `;
    const wrap = document.createElement("div");
    wrap.id = "comparaison-print";
    wrap.style.display = "none";
    const clone = el.cloneNode(true);
    clone.style.maxWidth = "900px";
    clone.style.margin = "0 auto";
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    document.head.appendChild(style);
    window.print();
    setTimeout(() => { try { document.body.removeChild(wrap); document.head.removeChild(style); } catch(_){} }, 2000);
  };

  const exportDocx = async (modeExpert) => {
    setDocxStatus("⏳ Génération...");
    try {
      const docx = await import("docx");
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, PageBreak, ShadingType } = docx;
      const border = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
      const borders = { top: border, bottom: border, left: border, right: border };
      const headerShading = { fill: "EFF6FF", type: ShadingType.CLEAR };
      const children = [];
      const mkP = (text, opts = {}) => new Paragraph({
        children: [new TextRun({ text: String(text ?? ""), font: "Arial", size: opts.size || 24, bold: opts.bold || false, color: opts.color || "1E293B", italics: opts.italic || false })],
        spacing: { after: opts.after ?? 120 },
        alignment: opts.alignment ?? AlignmentType.LEFT,
      });
      const commune = valid[0]?.commune ?? "—";

      // Page de couverture — même structure que le rapport à l'écran
      children.push(mkP("OBSERVATOIRE DE LA DÉLINQUANCE", { bold: true, size: 26, after: 80 }));
      children.push(mkP("COMMUNE DE " + commune.toUpperCase(), { bold: true, size: 28, after: 60 }));
      children.push(mkP("RAPPORT DE COMPARAISON DE PÉRIODES", { bold: true, size: 22, color: "2563EB", after: 80 }));
      children.push(mkP("Réalisé à partir des données mensuelles de l'Observatoire de la Délinquance — Faits constatés par les services de Gendarmerie Nationale et de Police Nationale", { size: 20, color: "64748B", after: 200 }));
      // Grille 3 colonnes (Période A | Période B | Écart) comme à l'écran
      const coverColW = [2400, 2400, 2400];
      const cellAparas = [new Paragraph({ children: [new TextRun({ text: labelPeriod(entriesA) })] }), new Paragraph({ children: [new TextRun({ text: totalA + " faits", bold: true, color: "1E40AF" })] })];
        if (tauxMoyA != null) cellAparas.push(new Paragraph({ children: [new TextRun({ text: tauxMoyA.toFixed(2) + " ‰ moy.", size: 20, color: "64748B" })] }));
        const cellBparas = [new Paragraph({ children: [new TextRun({ text: labelPeriod(entriesB) })] }), new Paragraph({ children: [new TextRun({ text: totalB + " faits", bold: true, color: "0F766E" })] })];
        if (tauxMoyB != null) cellBparas.push(new Paragraph({ children: [new TextRun({ text: tauxMoyB.toFixed(2) + " ‰ moy.", size: 20, color: "64748B" })] }));
        const coverTable = new Table({
          width: { size: 7200, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [
              new TableCell({ borders, width: { size: coverColW[0], type: WidthType.DXA }, shading: headerShading, children: [new Paragraph({ children: [new TextRun({ text: "Période A", bold: true, color: "1E40AF" })] })] }),
              new TableCell({ borders, width: { size: coverColW[1], type: WidthType.DXA }, shading: headerShading, children: [new Paragraph({ children: [new TextRun({ text: "Période B", bold: true, color: "0F766E" })] })] }),
              new TableCell({ borders, width: { size: coverColW[2], type: WidthType.DXA }, shading: headerShading, children: [new Paragraph({ children: [new TextRun({ text: "Écart (A / B)", bold: true })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: coverColW[0], type: WidthType.DXA }, children: cellAparas }),
              new TableCell({ borders, width: { size: coverColW[1], type: WidthType.DXA }, children: cellBparas }),
              new TableCell({ borders, width: { size: coverColW[2], type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Évolution" })] }), new Paragraph({ children: [new TextRun({ text: ecartPct != null ? (ecartPct > 0 ? "+" : "") + ecartPct + "%" : "—", bold: true })] })] }),
            ]}),
          ],
        });
      children.push(coverTable);
      children.push(mkP("", { after: 400 }));
      children.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }));

      // Chapitre 1 — Synthèse exécutive (même titre que à l'écran)
      children.push(mkP("CHAPITRE 1 — SYNTHÈSE EXÉCUTIVE", { bold: true, size: 22, after: 200 }));
      children.push(mkP(synthesisText));
      if (ecartPct != null) {
        const phrase = ecartPct > 0 ? "La période A enregistre davantage de faits constatés que la période B." : ecartPct < 0 ? "La période A enregistre moins de faits que la période B." : "Les deux périodes sont à égalité.";
        children.push(mkP(`L'écart global entre les deux périodes s'établit à ${ecartPct > 0 ? "+" : ""}${ecartPct}% : ${phrase}`));
      }
      children.push(mkP(""));

      // Chapitre 2 — Tableau par catégorie (présentation alignée écran)
      children.push(mkP("CHAPITRE 2 — COMPARAISON PAR CATÉGORIE", { bold: true, size: 22, after: 160 }));
      children.push(mkP("Répartition des faits constatés par grande catégorie d'infraction pour chaque période.", { after: 120 }));
      children.push(mkP("2.1 Tableau récapitulatif par catégorie", { bold: true, size: 20, after: 100 }));
      const colW2 = [2500, 1500, 1500, 1200];
      const h2 = ["Catégorie", "Période A", "Période B", "Écart %"];
      const tableCat = [
        new TableRow({ children: h2.map((h, i) => new TableCell({ borders, shading: headerShading, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })], width: { size: colW2[i], type: WidthType.DXA } })) }),
        ...categoryTableRows.map(r => new TableRow({
          children: [
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.cat })] })], width: { size: colW2[0], type: WidthType.DXA } }),
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: String(r.sumA) })] })], width: { size: colW2[1], type: WidthType.DXA } }),
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: String(r.sumB) })] })], width: { size: colW2[2], type: WidthType.DXA } }),
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.pct != null ? (r.pct > 0 ? "+" : "") + r.pct + "%" : "—" })] })], width: { size: colW2[3], type: WidthType.DXA } }),
          ]
        }))
      ];
      children.push(new Table({ width: { size: 6700, type: WidthType.DXA }, rows: tableCat }));
      children.push(mkP(""));

      // Chapitre 3 — Tableau détaillé (tous indicateurs, style comme à l'écran)
      children.push(mkP("CHAPITRE 3 — TABLEAU COMPARATIF DÉTAILLÉ", { bold: true, size: 22, after: 160 }));
      children.push(mkP("Le tableau suivant détaille, pour chaque indicateur, les totaux (ou taux moyens) de la période A et de la période B, ainsi que l'écart en pourcentage.", { after: 120 }));
      children.push(mkP("3.1 Tous les indicateurs (vue synthétique)", { bold: true, size: 20, after: 100 }));
      const colW = [2800, 1400, 1200, 1200, 1000];
      const headers = ["Indicateur", "Catégorie", "Période A", "Période B", "Écart %"];
      const tableRows = [
        new TableRow({ children: headers.map((h, i) => new TableCell({ borders, shading: headerShading, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })], width: { size: colW[i], type: WidthType.DXA } })) }),
        ...comparisonRows.map(r => {
          const fmtA = r.isTaux && r.sumA != null ? `${Number(r.sumA).toFixed(2)} ‰` : String(r.sumA ?? "—");
          const fmtB = r.isTaux && r.sumB != null ? `${Number(r.sumB).toFixed(2)} ‰` : String(r.sumB ?? "—");
          return new TableRow({
            children: [
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.label })] })], width: { size: colW[0], type: WidthType.DXA } }),
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.cat ?? "—" })] })], width: { size: colW[1], type: WidthType.DXA } }),
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: fmtA })] })], width: { size: colW[2], type: WidthType.DXA } }),
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: fmtB })] })], width: { size: colW[3], type: WidthType.DXA } }),
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.pct != null ? (r.pct > 0 ? "+" : "") + r.pct + "%" : "—" })] })], width: { size: colW[4], type: WidthType.DXA } }),
            ]
          });
        }),
        new TableRow({ children: [
          new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: "Synthèse (faits constatés)", bold: true })] })], width: { size: colW[0], type: WidthType.DXA } }),
          new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: "" })] })], width: { size: colW[1], type: WidthType.DXA } }),
          new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: totalA + " faits", bold: true })] })], width: { size: colW[2], type: WidthType.DXA } }),
          new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: totalB + " faits", bold: true })] })], width: { size: colW[3], type: WidthType.DXA } }),
          new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: ecartPct != null ? (ecartPct > 0 ? "+" : "") + ecartPct + "%" : "—", bold: true })] })], width: { size: colW[4], type: WidthType.DXA } }),
        ]})
      ];
      children.push(new Table({ width: { size: 7600, type: WidthType.DXA }, rows: tableRows }));
      children.push(mkP(""));

      // 3.2 Indicateurs par catégorie
      children.push(mkP("3.2 Indicateurs détaillés par catégorie", { bold: true, size: 20, after: 100 }));
      children.push(mkP("Détail des indicateurs regroupés par grande catégorie d'infraction.", { after: 120 }));
      const colW3 = [3000, 1500, 1500, 1200];
      const h3 = ["Indicateur", "Période A", "Période B", "Écart %"];
      const cats = [...new Set(comparisonRows.map(r => r.cat).filter(Boolean))];
      cats.forEach(cat => {
        children.push(mkP(cat, { bold: true, after: 80 }));
        const rowsCat = comparisonRows.filter(r => r.cat === cat);
        const subRows = [
          new TableRow({ children: h3.map((h, i) => new TableCell({ borders, shading: headerShading, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })], width: { size: colW3[i], type: WidthType.DXA } })) }),
          ...rowsCat.map(r => {
            const fmtA = r.isTaux && r.sumA != null ? `${Number(r.sumA).toFixed(2)} ‰` : String(r.sumA ?? "—");
            const fmtB = r.isTaux && r.sumB != null ? `${Number(r.sumB).toFixed(2)} ‰` : String(r.sumB ?? "—");
            return new TableRow({
              children: [
                new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.label })] })], width: { size: colW3[0], type: WidthType.DXA } }),
                new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: fmtA })] })], width: { size: colW3[1], type: WidthType.DXA } }),
                new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: fmtB })] })], width: { size: colW3[2], type: WidthType.DXA } }),
                new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.pct != null ? (r.pct > 0 ? "+" : "") + r.pct + "%" : "—" })] })], width: { size: colW3[3], type: WidthType.DXA } }),
              ]
            });
          })
        ];
        children.push(new Table({ width: { size: 7200, type: WidthType.DXA }, rows: subRows }));
        children.push(mkP(""));
      });

      // Chapitre 4 — Conclusion (aligné pied de page écran)
      children.push(mkP("CHAPITRE 4 — CONCLUSION", { bold: true, size: 22, after: 160 }));
      children.push(mkP(`La comparaison des périodes ${labelPeriod(entriesA)} (période A) et ${labelPeriod(entriesB)} (période B) pour la commune de ${commune} montre un total de ${totalA} faits constatés sur la période A et ${totalB} faits sur la période B.${ecartPct != null ? ` L'évolution entre les deux périodes est de ${ecartPct > 0 ? "+" : ""}${ecartPct}%.` : ""} Les données utilisées proviennent exclusivement des rapports mensuels de l'Observatoire de la Délinquance ; aucune donnée synthétique ou estimée n'a été utilisée.`, { after: 200 }));
      children.push(mkP("Rapport établi à partir des données mensuelles de l'Observatoire de la Délinquance — GIP Ressources & Territoires", { size: 18, color: "64748B", after: 80 }));
      children.push(mkP("Données Gendarmerie Nationale & Police Nationale — Comparaison de périodes", { size: 18, color: "64748B", after: 80 }));
      children.push(mkP("Période A : " + (entriesA.length ? entriesA.map(f => f.moisLabel + " " + f.annee).join(", ") : "—"), { size: 18, color: "64748B", after: 80 }));
      children.push(mkP("Période B : " + (entriesB.length ? entriesB.map(f => f.moisLabel + " " + f.annee).join(", ") : "—"), { size: 18, color: "64748B", after: 80 }));
      const todayStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
      children.push(mkP("Rapport généré le " + todayStr, { size: 18, color: "64748B", italic: true }));

      // ─── MODE EXPERT : annexes complètes ─────────────────────────────────────
      if (modeExpert) {
        const now = new Date();
        const dateGen = now.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "medium" });
        const nbFichiers = new Set([...entriesA, ...entriesB].map(f => f.fichierSource)).size;

        children.push(mkP(""));
        children.push(mkP("ANNEXES — MODE EXPERT", { bold: true, size: 22 }));
        children.push(mkP("Document généré à des fins d'analyse technique, de traçabilité et de reproductibilité.", { size: 20, color: "64748B" }));
        children.push(mkP(""));

        // A. Métadonnées et traçabilité
        children.push(mkP("A. MÉTADONNÉES ET TRAÇABILITÉ", { bold: true, size: 20 }));
        children.push(mkP(`Date et heure de génération : ${dateGen}`));
        children.push(mkP(`Commune : ${commune}`));
        children.push(mkP(`Période A : ${entriesA.length} mois — ${labelPeriod(entriesA)} — Total ${totalA} faits constatés${tauxMoyA != null ? ` — Taux moyen ${tauxMoyA.toFixed(2)} ‰` : ""}`));
        children.push(mkP(`Période B : ${entriesB.length} mois — ${labelPeriod(entriesB)} — Total ${totalB} faits constatés${tauxMoyB != null ? ` — Taux moyen ${tauxMoyB.toFixed(2)} ‰` : ""}`));
        children.push(mkP(`Écart global (A − B) / B : ${ecartPct != null ? (ecartPct > 0 ? "+" : "") + ecartPct + " %" : "—"}`));
        children.push(mkP(`Nombre de fichiers sources distincts utilisés : ${nbFichiers}`));
        children.push(mkP(""));

        // B. Détail des mois inclus (table)
        children.push(mkP("B. DÉTAIL DES MOIS INCLUS", { bold: true, size: 20 }));
        const colWB = [2200, 1200, 1200, 1800, 2800];
        const hB = ["Mois", "Année", "Période", "Faits du mois", "Fichier source"];
        const rowsB = [
          ...entriesA.map(f => [f.moisLabel, String(f.annee), "A", String(f.indicateurs?.general_faits?.valN ?? "—"), f.fichierSource ?? "—"]),
          ...entriesB.map(f => [f.moisLabel, String(f.annee), "B", String(f.indicateurs?.general_faits?.valN ?? "—"), f.fichierSource ?? "—"]),
        ];
        const tableB = [
          new TableRow({ children: hB.map((h, i) => new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })], width: { size: colWB[i], type: WidthType.DXA } })) }),
          ...rowsB.map(row => new TableRow({
            children: row.map((cell, i) => new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: String(cell) })] })], width: { size: colWB[i], type: WidthType.DXA } }))
          }))
        ];
        children.push(new Table({ width: { size: 9200, type: WidthType.DXA }, rows: tableB }));
        children.push(mkP(""));

        // C. Méthodologie et formules
        children.push(mkP("C. MÉTHODOLOGIE ET FORMULES", { bold: true, size: 20 }));
        children.push(mkP("Source des données", { bold: true }));
        children.push(mkP("Les données proviennent exclusivement des rapports mensuels de l'Observatoire national de la délinquance et des délits (OND), GIP Ressources & Territoires. Faits constatés par la Gendarmerie nationale et la Police nationale. Aucune donnée synthétique ni estimée n'est utilisée ; les valeurs sont extraites des PDFs importés."));
        children.push(mkP(""));
        children.push(mkP("Formules de calcul", { bold: true }));
        children.push(mkP("• Écart % entre périodes : Écart % = (Total période A − Total période B) / Total période B × 100. Un écart positif indique davantage de faits sur la période A."));
        children.push(mkP("• Taux pour 1 000 habitants : pour chaque mois, le taux est celui fourni par le rapport (faits constatés / population × 1 000). Le taux moyen affiché est la moyenne arithmétique des taux des mois de la période."));
        children.push(mkP("• Comparaison par indicateur : pour les volumes, somme des valeurs mensuelles sur la période ; pour le taux (indicateur « Taux pour 1 000 hab. »), moyenne des taux mensuels. L'écart % par indicateur est (Somme A − Somme B) / Somme B × 100 (ou équivalent pour les moyennes)."));
        children.push(mkP(""));
        children.push(mkP("Règles d'arrondi", { bold: true }));
        children.push(mkP("Pourcentages : entiers. Taux : 2 décimales. Les totaux en nombre de faits sont des entiers."));
        children.push(mkP(""));

        // D. Référentiel des indicateurs
        children.push(mkP("D. RÉFÉRENTIEL DES INDICATEURS", { bold: true, size: 20 }));
        children.push(mkP("Liste des indicateurs utilisés dans les tableaux, avec code interne, libellé, catégorie et type de grandeur."));
        const colWD = [2200, 2800, 1800, 1200];
        const hD = ["Code", "Libellé", "Catégorie", "Type"];
        const tableD = [
          new TableRow({ children: hD.map((h, i) => new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })], width: { size: colWD[i], type: WidthType.DXA } })) }),
          ...comparisonRows.map(r => new TableRow({
            children: [
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.key })] })], width: { size: colWD[0], type: WidthType.DXA } }),
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.label })] })], width: { size: colWD[1], type: WidthType.DXA } }),
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.cat ?? "—" })] })], width: { size: colWD[2], type: WidthType.DXA } }),
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: r.isTaux ? "Taux ‰" : "Volume" })] })], width: { size: colWD[3], type: WidthType.DXA } }),
            ]
          }))
        ];
        children.push(new Table({ width: { size: 8000, type: WidthType.DXA }, rows: tableD }));
        children.push(mkP(""));

        // E. Notes techniques et limites
        children.push(mkP("E. NOTES TECHNIQUES ET LIMITES", { bold: true, size: 20 }));
        children.push(mkP("• Les données sont extraites automatiquement des PDFs des rapports Observatoire ; la cohérence dépend du format des fichiers et du parsing."));
        children.push(mkP("• La population utilisée pour les taux est celle du rapport mensuel (commune, année) ; les évolutions de population sur la période ne sont pas prises en compte dans le taux moyen."));
        children.push(mkP("• Les catégories (Général, Personnes, Vols, Cambriolages, Automobile, Autres) correspondent au regroupement standard des indicateurs OND."));
        children.push(mkP("• Ce document mode expert est destiné aux analystes et à la reproductibilité des résultats ; il ne se substitue pas aux rapports officiels de l'Observatoire."));
        children.push(mkP(""));
      }

      const doc = new Document({ sections: [{ properties: {}, children }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Comparaison_${valid[0]?.commune?.replace(/\s/g, "_") ?? "rapport"}${modeExpert ? "_expert" : ""}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setDocxStatus("✓ Téléchargé");
      setTimeout(() => setDocxStatus(""), 3000);
    } catch (err) {
      setDocxStatus("❌ " + (err.message || "Erreur"));
      setTimeout(() => setDocxStatus(""), 4000);
    }
  };

  if (valid.length < 2) {
    return <div style={{color:THEME.colors.textMuted,fontSize:16,marginTop:40,fontFamily:THEME.font}}>Importez au moins 2 fichiers pour utiliser la comparaison.</div>;
  }

  const commune = valid[0].commune;
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const thStyleComp = { padding: "8px 12px", background: "#EFF6FF", color: "#1E293B", fontWeight: 700, fontSize: 12, borderBottom: "2px solid #BFDBFE", textAlign: "left" };
  const tdStyleComp = (val = null) => ({ padding: "7px 12px", fontSize: 13, color: "#334155", background: cellBg(val), borderBottom: "1px solid #F1F5F9" });
  const h2StyleComp = { fontSize: 17, fontWeight: 700, color: "#1E293B", margin: "32px 0 12px", paddingBottom: 8, borderBottom: "2px solid #E2E8F0" };
  const h3StyleComp = { fontSize: 14, fontWeight: 700, color: "#334155", margin: "20px 0 8px" };

  return (
    <div style={{ fontFamily: THEME.font }}>
      <h1 style={{fontSize:24,fontWeight:800,color:THEME.colors.text,marginBottom:6,letterSpacing:"-.02em"}}>Comparaison de périodes</h1>
      <p style={{fontSize:14,color:THEME.colors.textMuted,marginBottom:28}}>Comparez des mois, plusieurs mois ou des années complètes à partir des données importées. Toutes les valeurs proviennent des PDFs analysés.</p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:28}}>
        <div style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:24,boxShadow:THEME.shadow.card}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:THEME.colors.info}}>Période A</h2>
            <div style={{display:"flex",gap:8}}>
              {years.map(y => (
                <button key={y} type="button" onClick={() => selectYearA(y)} style={{padding:"6px 12px",fontSize:11,borderRadius:THEME.radius.sm,border:`1px solid #7DD3FC`,background:THEME.colors.infoBg,color:THEME.colors.info,cursor:"pointer",fontWeight:600,fontFamily:THEME.font}}>Année {y}</button>
              ))}
              <button type="button" onClick={clearA} style={{padding:"6px 12px",fontSize:11,borderRadius:THEME.radius.sm,border:`1px solid ${THEME.colors.border}`,background:THEME.colors.surfaceAlt,color:THEME.colors.textMuted,cursor:"pointer",fontFamily:THEME.font}}>Vider</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:220,overflowY:"auto"}}>
            {years.map(y => (
              <div key={y}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748B",marginBottom:4}}>{y}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(byYear[y] || []).map(f => {
                    const key = entryKey(f);
                    const checked = selectedA.has(key);
                    return (
                      <label key={key} style={{display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,color:"#334155"}}>
                        <input type="checkbox" checked={checked} onChange={() => toggleA(key)} style={{width:16,height:16}}/>
                        {f.moisLabel.slice(0,3)} {y}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {entriesA.length > 0 && <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${THEME.colors.border}`,fontSize:12,color:THEME.colors.textMuted}}>{totalA} faits · {entriesA.length} mois{tauxMoyA != null ? ` · ${tauxMoyA.toFixed(2)} ‰ moy.` : ""}</div>}
        </div>

        <div style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:24,boxShadow:THEME.shadow.card}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:THEME.colors.accent}}>Période B</h2>
            <div style={{display:"flex",gap:8}}>
              {years.map(y => (
                <button key={y} type="button" onClick={() => selectYearB(y)} style={{padding:"6px 12px",fontSize:11,borderRadius:THEME.radius.sm,border:"1px solid #5EEAD4",background:"#CCFBF1",color:THEME.colors.accentHover,cursor:"pointer",fontWeight:600,fontFamily:THEME.font}}>Année {y}</button>
              ))}
              <button type="button" onClick={clearB} style={{padding:"6px 12px",fontSize:11,borderRadius:THEME.radius.sm,border:`1px solid ${THEME.colors.border}`,background:THEME.colors.surfaceAlt,color:THEME.colors.textMuted,cursor:"pointer",fontFamily:THEME.font}}>Vider</button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:220,overflowY:"auto"}}>
            {years.map(y => (
              <div key={y}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748B",marginBottom:4}}>{y}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(byYear[y] || []).map(f => {
                    const key = entryKey(f);
                    const checked = selectedB.has(key);
                    return (
                      <label key={key} style={{display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,color:"#334155"}}>
                        <input type="checkbox" checked={checked} onChange={() => toggleB(key)} style={{width:16,height:16}}/>
                        {f.moisLabel.slice(0,3)} {y}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {entriesB.length > 0 && <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${THEME.colors.border}`,fontSize:12,color:THEME.colors.textMuted}}>{totalB} faits · {entriesB.length} mois{tauxMoyB != null ? ` · ${tauxMoyB.toFixed(2)} ‰ moy.` : ""}</div>}
        </div>
      </div>

      {entriesA.length > 0 && entriesB.length > 0 && (
        <>
          <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"center",marginBottom:28}}>
            <button onClick={copyReport} style={{padding:"10px 18px",borderRadius:THEME.radius.md,border:`1px solid ${THEME.colors.border}`,background:THEME.colors.surface,fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontFamily:THEME.font,boxShadow:THEME.shadow.card}}>📋 {copyStatus || "Copier le rapport"}</button>
            <button onClick={printReport} style={{padding:"10px 18px",borderRadius:THEME.radius.md,border:`1px solid ${THEME.colors.border}`,background:THEME.colors.surface,fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontFamily:THEME.font}}>🖨️ Imprimer / PDF</button>
          </div>

          <div id="rapport-comparaison" ref={reportRef} style={{background:THEME.colors.surface,borderRadius:THEME.radius.lg,border:`1px solid ${THEME.colors.border}`,padding:"40px 48px",boxShadow:THEME.shadow.card,maxWidth:900,fontSize:14,lineHeight:1.7,color:THEME.colors.text,fontFamily:THEME.font}}>

            {/* PAGE DE COUVERTURE — même design que la page Rapport */}
            <div style={{textAlign:"center",paddingBottom:32,borderBottom:"3px solid #1E293B",marginBottom:36}}>
              <div style={{fontSize:13,fontWeight:600,color:"#64748B",letterSpacing:".12em",marginBottom:6}}>OBSERVATOIRE DE LA DÉLINQUANCE</div>
              <div style={{fontSize:22,fontWeight:800,color:"#1E293B",marginBottom:4}}>COMMUNE DE {commune.toUpperCase()}</div>
              <div style={{fontSize:16,fontWeight:600,color:"#3B82F6",marginBottom:20}}>RAPPORT DE COMPARAISON DE PÉRIODES</div>
              <div style={{fontSize:12,color:"#64748B",marginBottom:20,fontStyle:"italic"}}>
                Réalisé à partir des données mensuelles de l'Observatoire de la Délinquance<br/>
                Faits constatés par les services de Gendarmerie Nationale et de Police Nationale
              </div>
              <div style={{display:"inline-grid",gridTemplateColumns:"repeat(3,1fr)",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",fontSize:13,maxWidth:720,margin:"0 auto"}}>
                <div style={{padding:"14px 20px",textAlign:"center",borderRight:"1px solid #E2E8F0"}}>
                  <div style={{color:"#64748B",fontWeight:600,marginBottom:4}}>Période A</div>
                  <div style={{fontWeight:700,color:"#1E293B",fontSize:12}}>{labelPeriod(entriesA)}</div>
                  <div style={{fontSize:16,fontWeight:700,color:"#1E40AF",marginTop:4}}>{totalA} faits</div>
                  {tauxMoyA != null && <div style={{fontSize:11,color:"#64748B"}}>{tauxMoyA.toFixed(2)} ‰ moy.</div>}
                </div>
                <div style={{padding:"14px 20px",textAlign:"center",borderRight:"1px solid #E2E8F0"}}>
                  <div style={{color:"#64748B",fontWeight:600,marginBottom:4}}>Période B</div>
                  <div style={{fontWeight:700,color:"#1E293B",fontSize:12}}>{labelPeriod(entriesB)}</div>
                  <div style={{fontSize:16,fontWeight:700,color:"#0F766E",marginTop:4}}>{totalB} faits</div>
                  {tauxMoyB != null && <div style={{fontSize:11,color:"#64748B"}}>{tauxMoyB.toFixed(2)} ‰ moy.</div>}
                </div>
                <div style={{padding:"14px 20px",textAlign:"center"}}>
                  <div style={{color:"#64748B",fontWeight:600,marginBottom:4}}>Écart (A / B)</div>
                  <div style={{fontWeight:700,color:"#1E293B",fontSize:12}}>Évolution</div>
                  <div style={{fontSize:16,fontWeight:700,color:ecartPct != null ? variationColor(ecartPct) : "#64748B",marginTop:4}}>{ecartPct != null ? `${ecartPct > 0 ? "+" : ""}${ecartPct}%` : "—"}</div>
                </div>
              </div>
            </div>

            {/* CHAPITRE 1 — SYNTHÈSE EXÉCUTIVE */}
            <h2 style={{...h2StyleComp,color:"#1E40AF",borderBottomColor:"#BFDBFE"}}>CHAPITRE 1 — SYNTHÈSE EXÉCUTIVE</h2>
            <p>{synthesisText}</p>
            {ecartPct != null && (
              <p>
                L'écart global entre les deux périodes s'établit à <strong style={{color:variationColor(ecartPct)}}>{ecartPct > 0 ? "+" : ""}{ecartPct}%</strong>
                {ecartPct > 0 ? " : la période A enregistre davantage de faits constatés que la période B." : ecartPct < 0 ? " : la période A enregistre moins de faits que la période B." : " : les deux périodes sont à égalité."}
              </p>
            )}

            {/* CHAPITRE 2 — COMPARAISON PAR CATÉGORIE */}
            {(chartCompareData.length > 0 || categoryTableRows.length > 0) && (
              <>
                <h2 style={h2StyleComp}>CHAPITRE 2 — COMPARAISON PAR CATÉGORIE</h2>
                <p style={{marginBottom:16}}>Répartition des faits constatés par grande catégorie d'infraction pour chaque période.</p>
                <h3 style={h3StyleComp}>2.1 Tableau récapitulatif par catégorie</h3>
                <div style={{overflowX:"auto",marginBottom:20}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:16}}>
                    <thead>
                      <tr>
                        <th style={{...thStyleComp,minWidth:160}}>Catégorie</th>
                        <th style={{...thStyleComp,textAlign:"right",minWidth:100}}>Période A</th>
                        <th style={{...thStyleComp,textAlign:"right",minWidth:100}}>Période B</th>
                        <th style={{...thStyleComp,textAlign:"right",minWidth:90}}>Écart %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryTableRows.map((row, i) => (
                        <tr key={i}>
                          <td style={tdStyleComp()}>{row.cat}</td>
                          <td style={{...tdStyleComp(row.sumA),textAlign:"right",fontWeight:600}}>{row.sumA}</td>
                          <td style={{...tdStyleComp(row.sumB),textAlign:"right",fontWeight:600}}>{row.sumB}</td>
                          <td style={{...tdStyleComp(),textAlign:"right",fontWeight:600,color:variationColor(row.pct)}}>{row.pct != null ? `${row.pct > 0 ? "+" : ""}${row.pct}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 style={h3StyleComp}>2.2 Représentation graphique</h3>
                <div style={{overflowX:"auto",marginBottom:24}}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartCompareData} layout="vertical" margin={{ left: 90 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9"/>
                      <XAxis type="number" tick={{fontSize:12,fill:"#64748B"}}/>
                      <YAxis type="category" dataKey="cat" tick={{fontSize:12,fill:"#64748B"}} width={85}/>
                      <Tooltip/>
                      <Legend/>
                      <Bar dataKey="Période A" fill={THEME.colors.info} name="Période A" radius={[0,4,4,0]}/>
                      <Bar dataKey="Période B" fill={THEME.colors.accent} name="Période B" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* CHAPITRE 3 — DÉTAIL PAR INDICATEUR */}
            <h2 style={h2StyleComp}>CHAPITRE 3 — TABLEAU COMPARATIF DÉTAILLÉ</h2>
            <h3 style={h3StyleComp}>3.1 Tous les indicateurs (vue synthétique)</h3>
            <p style={{marginBottom:12}}>Le tableau suivant détaille, pour chaque indicateur, les totaux (ou taux moyens) de la période A et de la période B, ainsi que l'écart en pourcentage.</p>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:16}}>
                <thead>
                  <tr>
                    <th style={{...thStyleComp,minWidth:220}}>Indicateur</th>
                    <th style={{...thStyleComp,minWidth:90}}>Catégorie</th>
                    <th style={{...thStyleComp,textAlign:"right",minWidth:100}}>Période A</th>
                    <th style={{...thStyleComp,textAlign:"right",minWidth:100}}>Période B</th>
                    <th style={{...thStyleComp,textAlign:"right",minWidth:90}}>Écart %</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map(r => (
                    <tr key={r.key}>
                      <td style={tdStyleComp()}>{r.label}</td>
                      <td style={tdStyleComp()}>{r.cat ?? "—"}</td>
                      <td style={{...tdStyleComp(r.sumA),textAlign:"right",fontWeight:600}}>{r.isTaux && r.sumA != null ? `${Number(r.sumA).toFixed(2)} ‰` : (r.sumA ?? "—")}</td>
                      <td style={{...tdStyleComp(r.sumB),textAlign:"right",fontWeight:600}}>{r.isTaux && r.sumB != null ? `${Number(r.sumB).toFixed(2)} ‰` : (r.sumB ?? "—")}</td>
                      <td style={{...tdStyleComp(),textAlign:"right",fontWeight:600,color:variationColor(r.pct)}}>{r.pct != null ? `${r.pct > 0 ? "+" : ""}${r.pct}%` : "—"}</td>
                    </tr>
                  ))}
                  <tr style={{background:"#EFF6FF"}}>
                    <td style={{...tdStyleComp(),fontWeight:700}}>Synthèse (faits constatés)</td>
                    <td style={tdStyleComp()}></td>
                    <td style={{...tdStyleComp(totalA),textAlign:"right",fontWeight:700}}>{totalA} faits</td>
                    <td style={{...tdStyleComp(totalB),textAlign:"right",fontWeight:700}}>{totalB} faits</td>
                    <td style={{...tdStyleComp(),textAlign:"right",fontWeight:700,color:variationColor(ecartPct)}}>{ecartPct != null ? `${ecartPct > 0 ? "+" : ""}${ecartPct}%` : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 style={h3StyleComp}>3.2 Indicateurs détaillés par catégorie</h3>
            <p style={{marginBottom:12}}>Détail des indicateurs regroupés par grande catégorie d'infraction.</p>
            {[...new Set(comparisonRows.map(r => r.cat).filter(Boolean))].map(cat => {
              const rows = comparisonRows.filter(r => r.cat === cat);
              if (rows.length === 0) return null;
              return (
                <div key={cat} style={{marginBottom:24}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#1E293B",marginBottom:8,paddingBottom:4,borderBottom:"1px solid #E2E8F0"}}>{cat}</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:8}}>
                      <thead>
                        <tr>
                          <th style={{...thStyleComp,minWidth:200}}>Indicateur</th>
                          <th style={{...thStyleComp,textAlign:"right",minWidth:90}}>Période A</th>
                          <th style={{...thStyleComp,textAlign:"right",minWidth:90}}>Période B</th>
                          <th style={{...thStyleComp,textAlign:"right",minWidth:80}}>Écart %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.key}>
                            <td style={tdStyleComp()}>{r.label}</td>
                            <td style={{...tdStyleComp(r.sumA),textAlign:"right"}}>{r.isTaux && r.sumA != null ? `${Number(r.sumA).toFixed(2)} ‰` : (r.sumA ?? "—")}</td>
                            <td style={{...tdStyleComp(r.sumB),textAlign:"right"}}>{r.isTaux && r.sumB != null ? `${Number(r.sumB).toFixed(2)} ‰` : (r.sumB ?? "—")}</td>
                            <td style={{...tdStyleComp(),textAlign:"right",color:variationColor(r.pct)}}>{r.pct != null ? `${r.pct > 0 ? "+" : ""}${r.pct}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* CHAPITRE 4 — CONCLUSION */}
            <h2 style={h2StyleComp}>CHAPITRE 4 — CONCLUSION</h2>
            <p>
              La comparaison des périodes <strong>{labelPeriod(entriesA)}</strong> (période A) et <strong>{labelPeriod(entriesB)}</strong> (période B) pour la commune de <strong>{commune}</strong> montre un total de <strong>{totalA} faits</strong> constatés sur la période A et <strong>{totalB} faits</strong> sur la période B.
              {ecartPct != null && <> L'évolution entre les deux périodes est de <strong>{ecartPct > 0 ? "+" : ""}{ecartPct}%</strong>. </>}
              Les données utilisées proviennent exclusivement des rapports mensuels de l'Observatoire de la Délinquance ; aucune donnée synthétique ou estimée n'a été utilisée.
            </p>

            {/* Pied de page — même style que la page Rapport */}
            <div style={{marginTop:40,paddingTop:16,borderTop:"1px solid #E2E8F0",fontSize:11,color:"#94A3B8",lineHeight:2}}>
              Rapport établi à partir des données mensuelles de l'Observatoire de la Délinquance — GIP Ressources & Territoires<br/>
              Données Gendarmerie Nationale & Police Nationale — Comparaison de périodes<br/>
              Période A : {entriesA.length ? entriesA.map(f => `${f.moisLabel} ${f.annee}`).join(", ") : "—"}<br/>
              Période B : {entriesB.length ? entriesB.map(f => `${f.moisLabel} ${f.annee}`).join(", ") : "—"}<br/>
              Rapport généré le {today}
            </div>
          </div>
        </>
      )}

      {entriesA.length === 0 && entriesB.length === 0 && (
        <div style={{background:THEME.colors.surfaceAlt,borderRadius:THEME.radius.lg,padding:28,textAlign:"center",color:THEME.colors.textMuted,fontSize:14,fontFamily:THEME.font}}>Sélectionnez au moins un mois pour la période A et un pour la période B pour afficher la comparaison.</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// APP PRINCIPALE
// ─────────────────────────────────────────────────────────────
const SIMPLE_SUB_VIEWS = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "tendances", icon: "📅", label: "Tendances", disabledMinFiles: 2 },
  { id: "rapport", icon: "📄", label: "Rapport" },
];

export default function App() {
  const [view, setView] = useState("import");
  const [simpleSubView, setSimpleSubView] = useState("dashboard");
  const [parsedFiles, setParsedFiles] = useState([]);

  const validCount = parsedFiles.filter(f => !f.erreur).length;

  const navItems = [
    { id: "import", icon: "📥", label: "Import" },
    { id: "analyse-simple", icon: "📊", label: "Analyse simple", disabled: validCount < 1 },
    { id: "analyse-comparative", icon: "⚖️", label: "Analyse comparative", disabled: validCount < 2 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: THEME.colors.surfaceAlt, fontFamily: THEME.font }}>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* SIDEBAR */}
      <div style={{ width: 220, background: THEME.colors.sidebar, display: "flex", flexDirection: "column", padding: "28px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh", boxShadow: "4px 0 24px rgba(0,0,0,.08)" }}>
        <div style={{ padding: "0 20px 28px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.5)", letterSpacing: ".18em", marginBottom: 6 }}>OBSERVATOIRE</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: THEME.colors.sidebarText, lineHeight: 1.25, letterSpacing: "-.02em" }}>Délinquance<br/>Municipale</div>
        </div>
        <nav style={{ padding: "20px 12px", flex: 1 }}>
          {navItems.map(item => (
            <button key={item.id}
              disabled={item.disabled}
              onClick={()=>{if(!item.disabled)setView(item.id); if(item.id==="analyse-simple")setSimpleSubView("dashboard");}}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                borderRadius: THEME.radius.md, border: "none", cursor: item.disabled ? "not-allowed" : "pointer",
                background: view === item.id ? THEME.colors.sidebarActive : "transparent",
                color: item.disabled ? "rgba(255,255,255,.4)" : view === item.id ? "#fff" : THEME.colors.sidebarText,
                fontSize: 14, fontWeight: view === item.id ? 700 : 500,
                marginBottom: 4, textAlign: "left", transition: "all .2s", fontFamily: THEME.font,
              }}
              onMouseEnter={e=>{if(!item.disabled && view!==item.id){e.currentTarget.style.background=THEME.colors.sidebarHover;}}}
              onMouseLeave={e=>{if(view!==item.id)e.currentTarget.style.background="transparent";}}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span>{item.label}</span>
              {(item.id==="analyse-simple"&&validCount<1)||(item.id==="analyse-comparative"&&validCount<2) ? <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,.45)" }}>{(item.id==="analyse-comparative"?"≥2":"≥1")}</span> : null}
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>{validCount} fichier{validCount!==1?"s":""} parsé{validCount!==1?"s":""}</div>
        </div>
      </div>

      {/* MAIN */}
      <main style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>
        {view === "import" && <ViewImport parsedFiles={parsedFiles} setParsedFiles={setParsedFiles} setView={setView} setSimpleSubView={setSimpleSubView}/>}

        {view === "analyse-simple" && (
          <div style={{ fontFamily: THEME.font }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: THEME.colors.textMuted, fontWeight: 600, marginRight: 4 }}>Analyse simple :</span>
              {SIMPLE_SUB_VIEWS.map(sub => {
                const disabled = sub.disabledMinFiles != null && validCount < sub.disabledMinFiles;
                const active = simpleSubView === sub.id;
                return (
                  <button key={sub.id} type="button" disabled={disabled}
                    onClick={()=>!disabled && setSimpleSubView(sub.id)}
                    style={{
                      padding: "10px 18px", borderRadius: THEME.radius.md, border: `1px solid ${active ? THEME.colors.accent : THEME.colors.border}`,
                      background: active ? THEME.colors.accent : THEME.colors.surface, color: active ? "#fff" : disabled ? THEME.colors.textMuted : THEME.colors.text,
                      fontWeight: 600, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: THEME.font,
                      boxShadow: active ? "0 2px 8px rgba(13,148,136,.25)" : THEME.shadow.card,
                    }}>
                    <span>{sub.icon}</span>
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>
            {simpleSubView === "dashboard" && <ViewDashboard parsedFiles={parsedFiles}/>}
            {simpleSubView === "tendances" && <ViewTendances parsedFiles={parsedFiles}/>}
            {simpleSubView === "rapport" && <ViewRapport parsedFiles={parsedFiles}/>}
          </div>
        )}

        {view === "analyse-comparative" && <ViewComparaison parsedFiles={parsedFiles}/>}
      </main>
      </div>

      {/* PIED DE PAGE — signature application */}
      <footer style={{ flexShrink: 0, padding: "12px 24px", textAlign: "center", fontSize: 12, color: THEME.colors.textMuted, borderTop: `1px solid ${THEME.colors.border}`, background: THEME.colors.surface, fontFamily: THEME.font }}>
        Imaginé par WilGLN-V1.0
      </footer>
    </div>
  );
}
