import { useState, useRef, useEffect } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ═══════════════════════════════════════════════════════════════
//  CONFIGURA QUI I TUOI DATI FIREBASE
// ═══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
   apiKey: "AIzaSyD0D_Bv58XDUhUlhmn3xBUMmZpgQ8FlwEA",
  authDomain: "controllo-qualita-3f014.firebaseapp.com",
  databaseURL: "https://controllo-qualita-3f014-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "controllo-qualita-3f014",
  storageBucket: "controllo-qualita-3f014.firebasestorage.app",
  messagingSenderId: "624379495703",
  appId: "1:624379495703:web:0cf802649e0f047d82e352",
};
// ═══════════════════════════════════════════════════════════════

const DIFETTI_COMUNI = [
  "Cucitura difettosa","Colla non aderente","Tomaia graffiata",
  "Suola scollata","Colore non uniforme","Taglia errata",
  "Laccio mancante","Fodera strappata","Punta ammaccata",
  "Tacco storto","Fibbia difettosa","Cuciture a vista",
  "Macchia su tomaia","Materiale difettoso","Altro"
];
const PROBLEMI_RESO = [
  "Difetto grave non riparabile","Dimensioni errate","Materiale sbagliato",
  "Colore non conforme","Danno strutturale","Contaminazione","Altro"
];

const BLANK_ARTICOLO = {
  modello:"", qtaControllata:"", qtaConformi:"", qtaRiparate:"", qtaKO:"", qtaRese:"",
  difettiRiparati:[], motiviReso:[], noteDifetti:"", noteReso:"", fotoDifetti:[]
};

function fmt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
}
function getWeek(d) {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7) + 1;
}
function getYearWeek(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-W${String(getWeek(iso)).padStart(2,"0")}`;
}
function getYearMonth(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1000;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve({ data: canvas.toDataURL("image/jpeg", 0.75), nome: file.name });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function openPrint(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (win) { win.onload = () => setTimeout(() => win.print(), 600); }
  else { const a = document.createElement("a"); a.href = url; a.download = "rapporto-qc.html"; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// ── PDF singolo rapporto ──────────────────────────────────────────────────
function buildPDF(r) {
  const articoli = r.articoli || [];
  const totCtrl  = articoli.reduce((a,x) => a + (parseInt(x.qtaControllata)||0), 0);
  const totConf  = articoli.reduce((a,x) => a + (parseInt(x.qtaConformi)||0), 0);
  const totRip   = articoli.reduce((a,x) => a + (parseInt(x.qtaRiparate)||0), 0);
  const totKO    = articoli.reduce((a,x) => a + (parseInt(x.qtaKO)||0), 0);
  const totRese  = articoli.reduce((a,x) => a + (parseInt(x.qtaRese)||0), 0);
  const pConf    = totCtrl > 0 ? Math.round(totConf/totCtrl*100) : 0;

  const articoliHTML = articoli.map((art, idx) => {
    const qC = parseInt(art.qtaControllata)||0;
    const qCo= parseInt(art.qtaConformi)||0;
    const qR = parseInt(art.qtaRiparate)||0;
    const qK = parseInt(art.qtaKO)||0;
    const qRe= parseInt(art.qtaRese)||0;
    const pCo= qC>0?Math.round(qCo/qC*100):0;
    const pR = qC>0?Math.round(qR/qC*100):0;
    const pK = qC>0?Math.round(qK/qC*100):0;
    const pRe= qC>0?Math.round(qRe/qC*100):0;
    const photos = (art.fotoDifetti||[]).map((p,i) =>
      `<div style="display:inline-block;text-align:center;margin:6px">
        <img src="${p.data}" style="width:220px;height:165px;object-fit:cover;border:1px solid #ddd;border-radius:6px;display:block"/>
        <div style="font-size:9px;color:#888;margin-top:3px">${p.nome||"Foto "+(i+1)}</div>
      </div>`).join("");
    return `
    <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:16px;page-break-inside:avoid">
      <div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #1a1a1a">
        Articolo ${idx+1} — ${art.modello}
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px">
        <div style="background:#f5f5f5;border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#1a1a1a">${qC}</div>
          <div style="font-size:8px;color:#666;margin-top:2px;text-transform:uppercase">Controllate</div>
        </div>
        <div style="background:#eafaf1;border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#27ae60">${qCo}</div>
          <div style="font-size:8px;color:#27ae60;margin-top:2px;text-transform:uppercase">Conformi</div>
          <div style="font-size:9px;font-weight:700;color:#27ae60">${pCo}%</div>
        </div>
        <div style="background:#fff8e1;border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#e67e22">${qR}</div>
          <div style="font-size:8px;color:#e67e22;margin-top:2px;text-transform:uppercase">Riparate</div>
          <div style="font-size:9px;font-weight:700;color:#e67e22">${pR}%</div>
        </div>
        <div style="background:#fce4ec;border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#c0392b">${qK}</div>
          <div style="font-size:8px;color:#c0392b;margin-top:2px;text-transform:uppercase">KO</div>
          <div style="font-size:9px;font-weight:700;color:#c0392b">${pK}%</div>
        </div>
        <div style="background:#fde8e8;border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#e74c3c">${qRe}</div>
          <div style="font-size:8px;color:#e74c3c;margin-top:2px;text-transform:uppercase">Rese</div>
          <div style="font-size:9px;font-weight:700;color:#e74c3c">${pRe}%</div>
        </div>
      </div>
      <div style="height:14px;border-radius:5px;overflow:hidden;display:flex;margin-bottom:10px;border:1px solid #eee">
        <div style="background:#27ae60;width:${pCo}%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;overflow:hidden">${pCo>8?pCo+"%":""}</div>
        <div style="background:#e67e22;width:${pR}%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;overflow:hidden">${pR>5?pR+"%":""}</div>
        <div style="background:#c0392b;width:${pK}%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;overflow:hidden">${pK>5?pK+"%":""}</div>
        <div style="background:#e74c3c;width:${pRe}%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;overflow:hidden">${pRe>5?pRe+"%":""}</div>
      </div>
      ${(art.difettiRiparati||[]).length>0?`
      <div style="margin-bottom:8px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;margin-bottom:5px">Difetti rilevati</div>
        <div>${art.difettiRiparati.map(d=>`<span style="background:#fff3cd;color:#856404;border-radius:4px;padding:2px 7px;font-size:10px;margin:2px;display:inline-block">${d}</span>`).join("")}</div>
        ${art.noteDifetti?`<div style="font-size:10px;color:#555;background:#fffde7;padding:6px 8px;border-radius:4px;margin-top:5px">${art.noteDifetti}</div>`:""}
      </div>`:""}
      ${(art.motiviReso||[]).length>0?`
      <div style="margin-bottom:8px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;margin-bottom:5px">Motivi reso</div>
        <div>${art.motiviReso.map(d=>`<span style="background:#fde8e8;color:#7b1a1a;border-radius:4px;padding:2px 7px;font-size:10px;margin:2px;display:inline-block">${d}</span>`).join("")}</div>
        ${art.noteReso?`<div style="font-size:10px;color:#555;background:#fff5f5;padding:6px 8px;border-radius:4px;margin-top:5px">${art.noteReso}</div>`:""}
      </div>`:""}
      ${photos?`<div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;margin-bottom:6px">Foto difetti</div><div style="display:flex;flex-wrap:wrap;gap:4px">${photos}</div></div>`:""}
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QC ${r.calzaturificio} ${fmtDate(r.dataControllo)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px;max-width:900px}
  @media print{body{padding:12px}@page{margin:8mm}}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
  </style></head><body>

  <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1a1a1a">
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:32px;font-weight:900;color:#1a1a1a;letter-spacing:4px;text-transform:uppercase">MOSAICON SHOES</div>
    <div style="font-size:11px;color:#666;margin-top:4px;letter-spacing:2px;text-transform:uppercase">Rapporto Controllo Qualita</div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
    <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Calzaturificio</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a1a">${r.calzaturificio}</div>
    </div>
    <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Controllore</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a1a">${r.controllore}</div>
    </div>
    <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Data e ora</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a1a">${fmt(r.dataControllo)}</div>
    </div>
    <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Articoli controllati</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a1a">${articoli.length}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px">
    ${[["Totale",totCtrl,"#1a1a1a","#f5f5f5"],["Conformi",totConf,"#27ae60","#eafaf1"],["Riparate",totRip,"#e67e22","#fff8e1"],["KO",totKO,"#c0392b","#fce4ec"],["Rese",totRese,"#e74c3c","#fde8e8"]].map(([l,n,c,bg])=>`
    <div style="background:${bg};border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:${c}">${n}</div>
      <div style="font-size:9px;color:${c};margin-top:2px;text-transform:uppercase;font-weight:700">${l}</div>
      ${l!=="Totale"&&totCtrl>0?`<div style="font-size:10px;color:${c};font-weight:700;margin-top:1px">${Math.round(n/totCtrl*100)}%</div>`:""}
    </div>`).join("")}
  </div>

  <div style="margin-bottom:20px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#555;margin-bottom:6px">Composizione lotto complessivo</div>
    <div style="height:16px;border-radius:6px;overflow:hidden;display:flex;border:1px solid #eee">
      <div style="background:#27ae60;width:${pConf}%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;overflow:hidden">${pConf>8?pConf+"%":""}</div>
      <div style="background:#e67e22;width:${totCtrl>0?Math.round(totRip/totCtrl*100):0}%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;overflow:hidden"></div>
      <div style="background:#c0392b;width:${totCtrl>0?Math.round(totKO/totCtrl*100):0}%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;overflow:hidden"></div>
      <div style="background:#e74c3c;width:${totCtrl>0?Math.round(totRese/totCtrl*100):0}%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;overflow:hidden"></div>
    </div>
  </div>

  <div style="font-size:13px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1a1a1a;padding-bottom:6px;margin-bottom:14px">
    Dettaglio articoli
  </div>
  ${articoliHTML}

  <div style="margin-top:24px;border-top:1px solid #ddd;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#aaa">
    <span>Mosaicon Shoes — Sistema QC Calzaturiero</span>
    <span style="background:#d4edda;color:#155724;padding:2px 10px;border-radius:4px;font-weight:700;font-size:9px">DOCUMENTO UFFICIALE</span>
  </div>
  </body></html>`;
}

// ── PDF cumulativo ────────────────────────────────────────────────────────
function buildCumulativePDF(reports, filtro) {
  const totCtrl = reports.reduce((a,r) => a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaControllata)||0),0),0);
  const totConf = reports.reduce((a,r) => a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaConformi)||0),0),0);
  const totRip  = reports.reduce((a,r) => a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaRiparate)||0),0),0);
  const totKO   = reports.reduce((a,r) => a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaKO)||0),0),0);
  const totRese = reports.reduce((a,r) => a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaRese)||0),0),0);
  const avgConf = totCtrl>0?Math.round(totConf/totCtrl*100):0;

  // raggruppa per calzaturificio
  const byFab = {};
  reports.forEach(r => {
    const fab = r.calzaturificio || "N/D";
    if (!byFab[fab]) byFab[fab] = { reports:0, articoli:0, ctrl:0, conf:0, rip:0, ko:0, rese:0 };
    byFab[fab].reports++;
    (r.articoli||[]).forEach(a => {
      byFab[fab].articoli++;
      byFab[fab].ctrl  += parseInt(a.qtaControllata)||0;
      byFab[fab].conf  += parseInt(a.qtaConformi)||0;
      byFab[fab].rip   += parseInt(a.qtaRiparate)||0;
      byFab[fab].ko    += parseInt(a.qtaKO)||0;
      byFab[fab].rese  += parseInt(a.qtaRese)||0;
    });
  });

  const fabRows = Object.entries(byFab).map(([fab, d]) => `
    <tr>
      <td style="padding:8px 10px;font-weight:700">${fab}</td>
      <td style="padding:8px 10px;text-align:center">${d.reports}</td>
      <td style="padding:8px 10px;text-align:center">${d.ctrl}</td>
      <td style="padding:8px 10px;text-align:center;color:#27ae60;font-weight:700">${d.conf} (${d.ctrl>0?Math.round(d.conf/d.ctrl*100):0}%)</td>
      <td style="padding:8px 10px;text-align:center;color:#e67e22">${d.rip}</td>
      <td style="padding:8px 10px;text-align:center;color:#c0392b">${d.ko}</td>
      <td style="padding:8px 10px;text-align:center;color:#e74c3c">${d.rese}</td>
    </tr>`).join("");

  const righeReport = reports.map(r => `
    <tr style="border-bottom:1px solid #eee">
      <td style="padding:6px 10px">${fmtDate(r.dataControllo)}</td>
      <td style="padding:6px 10px;font-weight:500">${r.calzaturificio}</td>
      <td style="padding:6px 10px">${r.controllore}</td>
      <td style="padding:6px 10px">${(r.articoli||[]).length}</td>
      <td style="padding:6px 10px;text-align:center">${(r.articoli||[]).reduce((a,x)=>a+(parseInt(x.qtaControllata)||0),0)}</td>
      <td style="padding:6px 10px;text-align:center;color:#27ae60;font-weight:700">${(()=>{const c=(r.articoli||[]).reduce((a,x)=>a+(parseInt(x.qtaControllata)||0),0);const co=(r.articoli||[]).reduce((a,x)=>a+(parseInt(x.qtaConformi)||0),0);return c>0?Math.round(co/c*100)+"%":"—"})()}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Cumulativo — Mosaicon Shoes</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px}table{width:100%;border-collapse:collapse}th{background:#1a1a1a;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}tr:nth-child(even){background:#f9f9f9}@media print{body{padding:12px}@page{margin:8mm}}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
  </head><body>
  <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1a1a1a">
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:32px;font-weight:900;color:#1a1a1a;letter-spacing:4px">MOSAICON SHOES</div>
    <div style="font-size:11px;color:#666;margin-top:4px;letter-spacing:2px;text-transform:uppercase">Report Cumulativo — ${filtro}</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px">
    ${[["Paia totali",totCtrl,"#1a1a1a","#f5f5f5"],["Conformi",totConf,"#27ae60","#eafaf1"],["Riparate",totRip,"#e67e22","#fff8e1"],["KO",totKO,"#c0392b","#fce4ec"],["Rese",totRese,"#e74c3c","#fde8e8"]].map(([l,n,c,bg])=>`
    <div style="background:${bg};border-radius:8px;padding:10px;text-align:center">
      <div style="font-size:24px;font-weight:700;color:${c}">${n}</div>
      <div style="font-size:9px;color:${c};text-transform:uppercase;font-weight:700;margin-top:2px">${l}</div>
      ${l!=="Paia totali"&&totCtrl>0?`<div style="font-size:10px;color:${c};font-weight:700">${Math.round(n/totCtrl*100)}%</div>`:""}
    </div>`).join("")}
  </div>
  <div style="margin-bottom:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#555">Conformita media: <span style="color:#27ae60">${avgConf}%</span> — Rapporti inclusi: <span style="color:#1a1a1a">${reports.length}</span></div>

  <div style="font-size:13px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1a1a1a;padding-bottom:5px;margin:18px 0 10px">Per calzaturificio</div>
  <table style="margin-bottom:20px">
    <thead><tr><th>Calzaturificio</th><th style="text-align:center">Rapporti</th><th style="text-align:center">Paia ctrl.</th><th style="text-align:center">Conformi</th><th style="text-align:center">Riparate</th><th style="text-align:center">KO</th><th style="text-align:center">Rese</th></tr></thead>
    <tbody>${fabRows}</tbody>
  </table>

  <div style="font-size:13px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1a1a1a;padding-bottom:5px;margin:18px 0 10px">Elenco rapporti</div>
  <table>
    <thead><tr><th>Data</th><th>Calzaturificio</th><th>Controllore</th><th>Articoli</th><th style="text-align:center">Paia ctrl.</th><th style="text-align:center">Conformita</th></tr></thead>
    <tbody>${righeReport}</tbody>
  </table>

  <div style="margin-top:24px;border-top:1px solid #ddd;padding-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#aaa">
    <span>Generato il ${new Date().toLocaleDateString("it-IT")} ore ${new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</span>
    <span style="background:#d4edda;color:#155724;padding:2px 10px;border-radius:4px;font-weight:700">MOSAICON SHOES — DOCUMENTO UFFICIALE</span>
  </div>
  </body></html>`;
}

// ── componenti UI ─────────────────────────────────────────────────────────
function Sec({ title, children, accent }) {
  return (
    <div style={{background:"var(--color-background-primary)",border:`0.5px solid ${accent?"var(--color-border-info)":"var(--color-border-tertiary)"}`,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:500,color:accent?"var(--color-text-info)":"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>{title}</div>
      {children}
    </div>
  );
}
function Fld({ label, children }) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{display:"block",fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}>{label}</label>
      {children}
    </div>
  );
}
function Pill({ n, label, color }) {
  return <span style={{background:`var(--color-background-${color})`,color:`var(--color-text-${color})`,borderRadius:6,padding:"2px 7px",fontSize:11}}>{n} {label}</span>;
}
function TagBtn({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{padding:"4px 10px",borderRadius:6,border:"0.5px solid",cursor:"pointer",fontSize:11,fontWeight:400,
      background:active?`var(--color-background-${color})`:"var(--color-background-secondary)",
      borderColor:active?`var(--color-border-${color})`:"var(--color-border-tertiary)",
      color:active?`var(--color-text-${color})`:"var(--color-text-secondary)"}}>
      {label}
    </button>
  );
}
function Toast({ t }) {
  return (
    <div style={{position:"fixed",top:16,right:16,zIndex:9999,
      background:t.ok?"var(--color-background-success)":"var(--color-background-danger)",
      color:t.ok?"var(--color-text-success)":"var(--color-text-danger)",
      border:"0.5px solid",borderColor:t.ok?"var(--color-border-success)":"var(--color-border-danger)",
      borderRadius:10,padding:"10px 18px",fontSize:13,fontWeight:500,maxWidth:340,boxShadow:"0 4px 20px rgba(0,0,0,.12)"}}>
      {t.msg}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]          = useState("list");
  const [reports, setReports]    = useState([]);
  const [selected, setSelected]  = useState(null);
  const [saving, setSaving]      = useState(false);
  const [toast, setToast]        = useState(null);
  const [dbReady, setDbReady]    = useState(false);
  const [dbError, setDbError]    = useState(false);
  const [filterFab, setFilterFab]= useState("tutti");
  const [filterPeriod, setFilterPeriod] = useState("tutti");
  const [filterArt, setFilterArt]= useState("");
  const [showCumul, setShowCumul]= useState(false);
  const [cumulPeriod, setCumulPeriod] = useState("settimana");
  const dbRef = useRef(null);
  const fileRefs = useRef({});

  const blankForm = { controllore:"", calzaturificio:"", dataControllo:new Date().toISOString().slice(0,16), articoli:[{...BLANK_ARTICOLO}] };
  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    try {
      const ok = FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.includes("INCOLLA");
      if (!ok) { setDbError(true); return; }
      const app = initializeApp(FIREBASE_CONFIG);
      const db  = getDatabase(app);
      dbRef.current = ref(db, "rapporti_v2");
      setDbReady(true);
      onValue(dbRef.current, snap => {
        const data = snap.val();
        if (data) {
          const list = Object.entries(data).map(([fbKey,v]) => ({...v,fbKey}));
          list.sort((a,b) => (b.ts||0)-(a.ts||0));
          setReports(list);
        } else { setReports([]); }
      });
    } catch(e) { setDbError(true); }
  }, []);

  function showToast(msg, ok=true) { setToast({msg,ok}); setTimeout(() => setToast(null), 3500); }
  function tog(arr,v) { return arr.includes(v)?arr.filter(x=>x!==v):[...arr,v]; }

  function setArticolo(idx, field, value) {
    setForm(f => { const arts=[...f.articoli]; arts[idx]={...arts[idx],[field]:value}; return {...f,articoli:arts}; });
  }
  function addArticolo() { setForm(f => ({...f,articoli:[...f.articoli,{...BLANK_ARTICOLO}]})); }
  function removeArticolo(idx) { setForm(f => ({...f,articoli:f.articoli.filter((_,i)=>i!==idx)})); }

  async function onPhoto(artIdx, e) {
    const files = Array.from(e.target.files);
    const compressed = await Promise.all(files.map(f => compressImage(f)));
    setForm(f => { const arts=[...f.articoli]; arts[artIdx]={...arts[artIdx],fotoDifetti:[...(arts[artIdx].fotoDifetti||[]),...compressed]}; return {...f,articoli:arts}; });
    e.target.value="";
  }

  async function submit() {
    if (!form.controllore.trim()||!form.calzaturificio.trim()) { showToast("Compila controllore e calzaturificio",false); return; }
    if (form.articoli.length===0||!form.articoli[0].modello.trim()) { showToast("Aggiungi almeno un articolo con il modello",false); return; }
    setSaving(true);
    const rep = { ...form, id:Date.now().toString().slice(-7), ts:Date.now(),
      articoli: form.articoli.map(a=>({...a,
        qtaControllata:parseInt(a.qtaControllata)||0,
        qtaConformi:parseInt(a.qtaConformi)||0,
        qtaRiparate:parseInt(a.qtaRiparate)||0,
        qtaKO:parseInt(a.qtaKO)||0,
        qtaRese:parseInt(a.qtaRese)||0,
      }))
    };
    try {
      if (dbReady&&dbRef.current) { await push(dbRef.current,rep); showToast("Rapporto salvato e sincronizzato"); }
      else { showToast("Firebase non configurato",false); }
    } catch(e) { showToast("Errore: "+e.message,false); }
    setSaving(false);
    setForm(blankForm);
    setView("list");
  }

  async function delReport(r) {
    if (!confirm("Eliminare questo rapporto?")) return;
    try {
      if (dbReady&&r.fbKey) {
        const app=initializeApp(FIREBASE_CONFIG);
        const db=getDatabase(app);
        await remove(ref(db,"rapporti_v2/"+r.fbKey));
      }
      showToast("Rapporto eliminato"); setView("list");
    } catch(e) { showToast("Errore: "+e.message,false); }
  }

  // filtri
  const allFabs = [...new Set(reports.map(r=>r.calzaturificio).filter(Boolean))].sort();
  const allArts = [...new Set(reports.flatMap(r=>(r.articoli||[]).map(a=>a.modello)).filter(Boolean))].sort();

  const filtered = reports.filter(r => {
    if (filterFab!=="tutti" && r.calzaturificio!==filterFab) return false;
    if (filterArt && !(r.articoli||[]).some(a=>a.modello?.toLowerCase().includes(filterArt.toLowerCase()))) return false;
    if (filterPeriod!=="tutti") {
      const d = r.dataControllo;
      const now = new Date();
      if (filterPeriod==="settimana" && getYearWeek(d)!==getYearWeek(now.toISOString())) return false;
      if (filterPeriod==="mese" && getYearMonth(d)!==getYearMonth(now.toISOString())) return false;
    }
    return true;
  });

  function exportCumul() {
    const now = new Date();
    let reps = reports;
    let label = "Tutti i periodi";
    if (filterFab!=="tutti") { reps=reps.filter(r=>r.calzaturificio===filterFab); }
    if (cumulPeriod==="settimana") { reps=reps.filter(r=>getYearWeek(r.dataControllo)===getYearWeek(now.toISOString())); label="Settimana corrente"; }
    else if (cumulPeriod==="mese") { reps=reps.filter(r=>getYearMonth(r.dataControllo)===getYearMonth(now.toISOString())); label="Mese corrente"; }
    if (reps.length===0) { showToast("Nessun rapporto nel periodo selezionato",false); return; }
    openPrint(buildCumulativePDF(reps, label+(filterFab!=="tutti"?" — "+filterFab:"")));
  }

  // ── totali dashboard
  const totCtrl = filtered.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(x.qtaControllata||0),0),0);
  const totConf = filtered.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(x.qtaConformi||0),0),0);
  const totKO   = filtered.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(x.qtaKO||0),0),0);
  const totRese = filtered.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(x.qtaRese||0),0),0);
  const avgConf = totCtrl>0?Math.round(totConf/totCtrl*100):0;

  // ── DETAIL ────────────────────────────────────────────────────────────────
  if (view==="detail"&&selected) {
    const r=selected;
    const totC=((r.articoli||[]).reduce((a,x)=>a+(x.qtaControllata||0),0));
    const totCo=((r.articoli||[]).reduce((a,x)=>a+(x.qtaConformi||0),0));
    const pConf=totC>0?Math.round(totCo/totC*100):0;
    return (
      <div style={{maxWidth:700,margin:"0 auto",padding:"0 0 60px"}}>
        {toast&&<Toast t={toast}/>}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>
          <button onClick={()=>setView("list")} style={{background:"none",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13,color:"var(--color-text-secondary)"}}>← Lista</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:500,fontSize:17}}>{r.calzaturificio}</div>
            <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>{r.controllore} · {fmt(r.dataControllo)}</div>
          </div>
          <button onClick={()=>openPrint(buildPDF(r))} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#1a1a2e",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>Stampa PDF</button>
          <button onClick={()=>delReport(r)} style={{background:"none",border:"0.5px solid var(--color-border-danger)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13,color:"var(--color-text-danger)"}}>Elimina</button>
        </div>

        {/* riepilogo */}
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 18px",marginBottom:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
            {[["Controllate",totC,"var(--color-text-primary)"],
              ["Conformi",totCo,"var(--color-text-success)"],
              [(r.articoli||[]).reduce((a,x)=>a+(x.qtaRiparate||0),0),"Riparate","var(--color-text-warning)"],
              [(r.articoli||[]).reduce((a,x)=>a+(x.qtaKO||0),0),"KO","var(--color-text-danger)"],
              [(r.articoli||[]).reduce((a,x)=>a+(x.qtaRese||0),0),"Rese","var(--color-text-danger)"],
            ].map(([n,l,c],i)=>typeof n==="number"?(
              <div key={i} style={{textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:500,color:c}}>{n}</div>
                <div style={{fontSize:10,color:"var(--color-text-secondary)",marginTop:2}}>{l}</div>
              </div>
            ):(
              <div key={i} style={{textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:500,color:l}}>{n}</div>
                <div style={{fontSize:10,color:"var(--color-text-secondary)",marginTop:2}}>{c}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:12,background:"var(--color-background-secondary)",borderRadius:8,padding:"6px 10px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>Conformita complessiva:</span>
            <span style={{fontSize:16,fontWeight:500,color:pConf>=90?"var(--color-text-success)":pConf>=70?"var(--color-text-warning)":"var(--color-text-danger)"}}>{pConf}%</span>
          </div>
        </div>

        {/* articoli */}
        {(r.articoli||[]).map((art,idx)=>{
          const qC=art.qtaControllata||0;
          const pC=qC>0?Math.round((art.qtaConformi||0)/qC*100):0;
          return (
            <div key={idx} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 18px",marginBottom:12}}>
              <div style={{fontWeight:500,fontSize:15,marginBottom:12,paddingBottom:8,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                Articolo {idx+1} — {art.modello}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:10}}>
                {[["Ctrl.",qC,"var(--color-text-primary)"],["Conf.",art.qtaConformi||0,"var(--color-text-success)"],["Rip.",art.qtaRiparate||0,"var(--color-text-warning)"],["KO",art.qtaKO||0,"var(--color-text-danger)"],["Rese",art.qtaRese||0,"var(--color-text-danger)"]].map(([l,n,c],i)=>(
                  <div key={i} style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:500,color:c}}>{n}</div>
                    <div style={{fontSize:10,color:"var(--color-text-secondary)",marginTop:2}}>{l}</div>
                    {i>0&&qC>0&&<div style={{fontSize:9,color:c,marginTop:1}}>{Math.round(n/qC*100)}%</div>}
                  </div>
                ))}
              </div>
              {(art.difettiRiparati||[]).length>0&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,fontWeight:500,color:"var(--color-text-warning)",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Difetti riparati</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {art.difettiRiparati.map(d=><span key={d} style={{background:"var(--color-background-warning)",color:"var(--color-text-warning)",borderRadius:5,padding:"3px 8px",fontSize:11}}>{d}</span>)}
                  </div>
                  {art.noteDifetti&&<div style={{fontSize:12,color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:6,padding:8,marginTop:6}}>{art.noteDifetti}</div>}
                </div>
              )}
              {(art.motiviReso||[]).length>0&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,fontWeight:500,color:"var(--color-text-danger)",textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Motivi reso</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {art.motiviReso.map(d=><span key={d} style={{background:"var(--color-background-danger)",color:"var(--color-text-danger)",borderRadius:5,padding:"3px 8px",fontSize:11}}>{d}</span>)}
                  </div>
                  {art.noteReso&&<div style={{fontSize:12,color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:6,padding:8,marginTop:6}}>{art.noteReso}</div>}
                </div>
              )}
              {(art.fotoDifetti||[]).length>0&&(
                <div>
                  <div style={{fontSize:10,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Foto difetti ({art.fotoDifetti.length})</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {art.fotoDifetti.map((p,i)=>(
                      <div key={i} style={{textAlign:"center"}}>
                        <img src={p.data} alt={p.nome} style={{width:140,height:105,objectFit:"cover",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)"}}/>
                        <div style={{fontSize:10,color:"var(--color-text-secondary)",marginTop:3,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.nome}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── FORM ──────────────────────────────────────────────────────────────────
  if (view==="form") {
    return (
      <div style={{maxWidth:680,margin:"0 auto",padding:"0 0 80px"}}>
        {toast&&<Toast t={toast}/>}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <button onClick={()=>setView("list")} style={{background:"none",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13,color:"var(--color-text-secondary)"}}>← Annulla</button>
          <h2 style={{margin:0,fontSize:18,fontWeight:500}}>Nuovo controllo qualita</h2>
        </div>

        <Sec title="Dati generali">
          <Fld label="Calzaturificio *">
            <input value={form.calzaturificio} onChange={e=>setForm(f=>({...f,calzaturificio:e.target.value}))} placeholder="Nome del calzaturificio controllato"/>
          </Fld>
          <Fld label="Controllore *">
            <input value={form.controllore} onChange={e=>setForm(f=>({...f,controllore:e.target.value}))} placeholder="Nome del controllore"/>
          </Fld>
          <Fld label="Data e ora">
            <input type="datetime-local" value={form.dataControllo} onChange={e=>setForm(f=>({...f,dataControllo:e.target.value}))}/>
          </Fld>
        </Sec>

        {form.articoli.map((art,idx)=>{
          const qC=parseInt(art.qtaControllata)||0;
          const qCo=parseInt(art.qtaConformi)||0;
          const qR=parseInt(art.qtaRiparate)||0;
          const qK=parseInt(art.qtaKO)||0;
          const qRe=parseInt(art.qtaRese)||0;
          const frRef = el => { if(el) fileRefs.current[idx]=el; };
          return (
            <div key={idx} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-info)",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-info)",textTransform:"uppercase",letterSpacing:1}}>Articolo {idx+1}</div>
                {form.articoli.length>1&&<button onClick={()=>removeArticolo(idx)} style={{background:"none",border:"0.5px solid var(--color-border-danger)",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,color:"var(--color-text-danger)"}}>Rimuovi</button>}
              </div>
              <Fld label="Modello / Articolo *">
                <input value={art.modello} onChange={e=>setArticolo(idx,"modello",e.target.value)} placeholder="Es. Derby Classic cod. AB123"/>
              </Fld>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:10}}>
                {[["Controllate *","qtaControllata"],["Conformi","qtaConformi"],["Riparate","qtaRiparate"],["KO","qtaKO"],["Rese","qtaRese"]].map(([l,f])=>(
                  <Fld key={f} label={l}>
                    <input type="number" min="0" value={art[f]} onChange={e=>setArticolo(idx,f,e.target.value)} placeholder="0" style={{padding:"6px 8px"}}/>
                  </Fld>
                ))}
              </div>
              {qC>0&&(
                <div style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"7px 10px",fontSize:12,color:"var(--color-text-secondary)",marginBottom:10}}>
                  Totale inserito: <strong>{qCo+qR+qK+qRe}</strong> / {qC}
                  &nbsp;·&nbsp; Conformita: <strong style={{color:qC>0&&qCo/qC>=.9?"var(--color-text-success)":"var(--color-text-warning)"}}>{qC>0?Math.round(qCo/qC*100):0}%</strong>
                </div>
              )}
              {qR>0&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"var(--color-text-warning)",fontWeight:500,marginBottom:6}}>Difetti riparati</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                    {DIFETTI_COMUNI.map(d=><TagBtn key={d} label={d} active={(art.difettiRiparati||[]).includes(d)} color="warning" onClick={()=>setArticolo(idx,"difettiRiparati",tog(art.difettiRiparati||[],d))}/>)}
                  </div>
                  <textarea value={art.noteDifetti} onChange={e=>setArticolo(idx,"noteDifetti",e.target.value)} placeholder="Note difetti..." rows={2} style={{resize:"vertical",width:"100%"}}/>
                </div>
              )}
              {qRe>0&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"var(--color-text-danger)",fontWeight:500,marginBottom:6}}>Motivi reso</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                    {PROBLEMI_RESO.map(d=><TagBtn key={d} label={d} active={(art.motiviReso||[]).includes(d)} color="danger" onClick={()=>setArticolo(idx,"motiviReso",tog(art.motiviReso||[],d))}/>)}
                  </div>
                  <textarea value={art.noteReso} onChange={e=>setArticolo(idx,"noteReso",e.target.value)} placeholder="Note reso..." rows={2} style={{resize:"vertical",width:"100%"}}/>
                </div>
              )}
              <div>
                <button onClick={()=>fileRefs.current[idx]?.click()} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:8,border:"0.5px dashed var(--color-border-secondary)",background:"var(--color-background-secondary)",cursor:"pointer",fontSize:12,color:"var(--color-text-secondary)",width:"100%",justifyContent:"center"}}>
                  Aggiungi foto difetti {art.fotoDifetti?.length>0&&`(${art.fotoDifetti.length})`}
                </button>
                <input ref={frRef} type="file" accept="image/*" multiple onChange={e=>onPhoto(idx,e)} style={{display:"none"}}/>
                {(art.fotoDifetti||[]).length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                    {art.fotoDifetti.map((p,i)=>(
                      <div key={i} style={{position:"relative"}}>
                        <img src={p.data} alt={p.nome} style={{width:80,height:60,objectFit:"cover",borderRadius:6,border:"0.5px solid var(--color-border-tertiary)"}}/>
                        <button onClick={()=>setArticolo(idx,"fotoDifetti",art.fotoDifetti.filter((_,j)=>j!==i))} style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,.65)",color:"#fff",border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>x</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <button onClick={addArticolo} style={{width:"100%",padding:"11px",borderRadius:10,border:"0.5px dashed var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",fontSize:14,cursor:"pointer",marginBottom:12}}>
          + Aggiungi articolo
        </button>
        <button onClick={submit} disabled={saving} style={{width:"100%",padding:"14px",borderRadius:10,border:"none",background:saving?"var(--color-border-secondary)":"#1a1a2e",color:"#fff",fontSize:15,fontWeight:500,cursor:saving?"not-allowed":"pointer"}}>
          {saving?"Salvataggio...":"Salva rapporto"}
        </button>
      </div>
    );
  }

  // ── LIST / DASHBOARD ──────────────────────────────────────────────────────
  return (
    <div style={{maxWidth:780,margin:"0 auto",padding:"0 0 40px"}}>
      {toast&&<Toast t={toast}/>}

      {/* header brand */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:24,paddingBottom:16,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
        <div>
          <div style={{fontSize:24,fontWeight:500,letterSpacing:"2px",color:"var(--color-text-primary)"}}>MOSAICON SHOES</div>
          <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2,letterSpacing:"1px"}}>QUALITY CONTROL</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {dbReady&&<div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"var(--color-text-success)"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"var(--color-text-success)"}}/>
            <span>Sincronizzato</span>
          </div>}
          <button onClick={()=>setView("form")} style={{padding:"9px 20px",borderRadius:8,border:"none",background:"#1a1a2e",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>+ Nuovo</button>
        </div>
      </div>

      {/* KPI cards */}
      {reports.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:20}}>
          {[
            ["Rapporti",filtered.length,"var(--color-text-primary)"],
            ["Paia ctrl.",totCtrl,"var(--color-text-primary)"],
            [avgConf+"%","Conformita","var(--color-text-success)"],
            [totKO,"Paia KO","var(--color-text-danger)"],
            [totRese,"Paia rese","var(--color-text-danger)"],
          ].map(([v,l,c],i)=>(
            <div key={i} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 12px",textAlign:"center"}}>
              <div style={{fontSize:i===2?26:22,fontWeight:500,color:c}}>{v}</div>
              <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* filtri */}
      {reports.length>0&&(
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Filtri</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>Calzaturificio</div>
              <select value={filterFab} onChange={e=>setFilterFab(e.target.value)} style={{width:"100%"}}>
                <option value="tutti">Tutti</option>
                {allFabs.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>Periodo</div>
              <select value={filterPeriod} onChange={e=>setFilterPeriod(e.target.value)} style={{width:"100%"}}>
                <option value="tutti">Tutti</option>
                <option value="settimana">Questa settimana</option>
                <option value="mese">Questo mese</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>Articolo</div>
              <input value={filterArt} onChange={e=>setFilterArt(e.target.value)} placeholder="Cerca articolo..." style={{width:"100%"}}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:10}}>
            <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>{filtered.length} rapporti trovati</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <select value={cumulPeriod} onChange={e=>setCumulPeriod(e.target.value)} style={{fontSize:12,padding:"5px 8px"}}>
                <option value="settimana">Settimana</option>
                <option value="mese">Mese</option>
                <option value="tutti">Tutti</option>
              </select>
              <button onClick={exportCumul} style={{padding:"6px 14px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",fontSize:12,cursor:"pointer",color:"var(--color-text-primary)",fontWeight:500}}>
                Esporta cumulativo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* lista rapporti */}
      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"60px 20px",color:"var(--color-text-secondary)"}}>
          <div style={{fontSize:48,marginBottom:16}}>👟</div>
          <div style={{fontSize:16,fontWeight:500}}>Nessun rapporto</div>
          <div style={{fontSize:13,marginTop:6}}>{reports.length>0?"Prova a cambiare i filtri":"Tocca Nuovo per iniziare"}</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(r=>{
          const totC=(r.articoli||[]).reduce((a,x)=>a+(x.qtaControllata||0),0);
          const totCo=(r.articoli||[]).reduce((a,x)=>a+(x.qtaConformi||0),0);
          const pct=totC>0?Math.round(totCo/totC*100):0;
          const c=pct>=90?"var(--color-text-success)":pct>=70?"var(--color-text-warning)":"var(--color-text-danger)";
          const bg=pct>=90?"var(--color-background-success)":pct>=70?"var(--color-background-warning)":"var(--color-background-danger)";
          const nFoto=(r.articoli||[]).reduce((a,x)=>a+(x.fotoDifetti?.length||0),0);
          return (
            <div key={r.fbKey||r.id} onClick={()=>{setSelected(r);setView("detail");}}
              style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--color-border-secondary)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="var(--color-border-tertiary)"}>
              <div style={{width:52,height:52,borderRadius:"50%",background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:14,fontWeight:500,color:c,lineHeight:1}}>{pct}%</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:500,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.calzaturificio}</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{r.controllore} · {fmt(r.dataControllo)}</div>
                <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:3}}>{(r.articoli||[]).length} articoli</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end",maxWidth:180}}>
                <Pill n={totC} label="ctrl" color="secondary"/>
                <Pill n={totCo} label="conf" color="success"/>
                {(r.articoli||[]).reduce((a,x)=>a+(x.qtaKO||0),0)>0&&<Pill n={(r.articoli||[]).reduce((a,x)=>a+(x.qtaKO||0),0)} label="KO" color="danger"/>}
                {nFoto>0&&<span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{nFoto} foto</span>}
              </div>
              <span style={{color:"var(--color-text-secondary)",fontSize:18,flexShrink:0}}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
