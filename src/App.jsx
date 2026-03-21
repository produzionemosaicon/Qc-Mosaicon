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

// ── colori light grey theme ───────────────────────────────────────────────
const D = {
  bg:      "#f0f2f5",
  surface: "#ffffff",
  border:  "#dde1e7",
  text:    "#1a1a2e",
  muted:   "#7a8394",
  green:   "#16a34a",
  greenBg: "#dcfce7",
  amber:   "#d97706",
  amberBg: "#fef3c7",
  red:     "#dc2626",
  redBg:   "#fee2e2",
  blue:    "#1a1a2e",
  blueBg:  "#e8eaf0",
  blueAcc: "#1a1a2e",
};

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
  dettaglioRese:[{articolo:"",taglia:""}],
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
  date.setDate(date.getDate() + 3 - (date.getDay()+6)%7);
  const w1 = new Date(date.getFullYear(),0,4);
  return Math.round(((date-w1)/86400000-3+(w1.getDay()+6)%7)/7)+1;
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
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1000;
        let w = img.width, h = img.height;
        if (w>MAX){h=Math.round(h*MAX/w);w=MAX;}
        if (h>MAX){w=Math.round(w*MAX/h);h=MAX;}
        canvas.width=w; canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        resolve({data:canvas.toDataURL("image/jpeg",0.75),nome:file.name});
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function openPrint(html) {
  const win = window.open("","_blank");
  if (win) {
    win.document.open(); win.document.write(html); win.document.close();
    setTimeout(()=>win.print(),1000);
  } else {
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="rapporto-qc.html"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
}

const PRINT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px}
  table{width:100%;border-collapse:collapse}
  th{background:#1a1a1a;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
  tr:nth-child(even) td{background:#f9f9f9}
  .sec-title{font-size:13px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1a1a1a;padding-bottom:6px;margin:20px 0 12px}
  @media print{body{padding:10px}@page{margin:8mm}}
`;
const BRAND_HEADER = sub => `
  <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1a1a1a">
    <div style="font-family:'Arial Black',Arial,sans-serif;font-size:36px;font-weight:900;color:#1a1a1a;letter-spacing:5px;text-transform:uppercase">MOSAICON SHOES</div>
    <div style="font-size:11px;color:#666;margin-top:6px;letter-spacing:2px;text-transform:uppercase">${sub}</div>
  </div>
`;

// ── PDF singolo ───────────────────────────────────────────────────────────
function buildPDF(r) {
  const arts = r.articoli||[];
  const totCtrl = arts.reduce((a,x)=>a+(parseInt(x.qtaControllata)||0),0);
  const totConf = arts.reduce((a,x)=>a+(parseInt(x.qtaConformi)||0),0);
  const totRip  = arts.reduce((a,x)=>a+(parseInt(x.qtaRiparate)||0),0);
  const totKO   = arts.reduce((a,x)=>a+(parseInt(x.qtaKO)||0),0);
  const totRese = arts.reduce((a,x)=>a+(parseInt(x.qtaRese)||0),0);
  const pConf   = totCtrl>0?Math.round(totConf/totCtrl*100):0;

  const artsHTML = arts.map((art,idx)=>{
    const qC=parseInt(art.qtaControllata)||0, qCo=parseInt(art.qtaConformi)||0;
    const qR=parseInt(art.qtaRiparate)||0,   qK=parseInt(art.qtaKO)||0, qRe=parseInt(art.qtaRese)||0;
    const pCo=qC>0?Math.round(qCo/qC*100):0, pR=qC>0?Math.round(qR/qC*100):0;
    const pK=qC>0?Math.round(qK/qC*100):0,   pRe=qC>0?Math.round(qRe/qC*100):0;
    const photos=(art.fotoDifetti||[]).map((p,i)=>{
      const nome = p.nome||("Foto "+(i+1));
      return '<div style="display:inline-block;text-align:center;margin:6px"><img src="'+p.data+'" style="width:220px;height:165px;object-fit:cover;border:1px solid #ddd;border-radius:6px;display:block"/><div style="font-size:9px;color:#888;margin-top:3px">'+nome+'</div></div>';
    }).join("");
    const kpiCards = (()=>{
      const items = [
        {l:"Controllate",n:qC,  c:"#1a1a1a",bg:"#f5f5f5"},
        {l:"Conformi",   n:qCo, c:"#27ae60",bg:"#eafaf1"},
        {l:"Riparate",   n:qR,  c:"#e67e22",bg:"#fff8e1"},
        {l:"KO",         n:qK,  c:"#c0392b",bg:"#fce4ec"},
        {l:"Rese",       n:qRe, c:"#e74c3c",bg:"#fde8e8"},
      ];
      const cells = items.map((k,i)=>{
        const pct = (i>0&&qC>0) ? ('<div style="font-size:10px;font-weight:700;color:'+k.c+'">'+Math.round(k.n/qC*100)+'%</div>') : '';
        return '<td style="width:20%;padding:4px"><div style="background:'+k.bg+';border-radius:6px;padding:10px;text-align:center"><div style="font-size:22px;font-weight:700;color:'+k.c+'">'+k.n+'</div><div style="font-size:9px;color:'+k.c+';margin-top:3px;text-transform:uppercase">'+k.l+'</div>'+pct+'</div></td>';
      }).join("");
      return '<table style="width:100%;border-collapse:separate;border-spacing:6px 0;table-layout:fixed"><tr>'+cells+'</tr></table>';
    })();
    return `
    <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:16px;page-break-inside:avoid">
      <div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #1a1a1a">
        Articolo ${idx+1} — ${art.modello}
      </div>
      ${kpiCards}
      <div style="height:14px;border-radius:5px;overflow:hidden;display:flex;margin-bottom:12px;border:1px solid #eee">
        <div style="background:#27ae60;width:${pCo}%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;overflow:hidden">${pCo>8?pCo+"%":""}</div>
        <div style="background:#e67e22;width:${pR}%;"></div>
        <div style="background:#c0392b;width:${pK}%;"></div>
        <div style="background:#e74c3c;width:${pRe}%;"></div>
      </div>
      ${(art.difettiRiparati||[]).length>0?`<div style="margin-bottom:10px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px">Difetti rilevati</div>
        <div>${art.difettiRiparati.map(d=>`<span style="background:#fff3cd;color:#856404;border-radius:4px;padding:3px 8px;font-size:10px;margin:2px;display:inline-block">${d}</span>`).join("")}</div>
        ${art.noteDifetti?`<div style="font-size:10px;color:#555;background:#fffde7;padding:6px 8px;border-radius:4px;margin-top:6px">${art.noteDifetti}</div>`:""}
      </div>`:""}
      ${(art.motiviReso||[]).length>0?`<div style="margin-bottom:10px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px">Motivi reso</div>
        <div>${art.motiviReso.map(d=>`<span style="background:#fde8e8;color:#7b1a1a;border-radius:4px;padding:3px 8px;font-size:10px;margin:2px;display:inline-block">${d}</span>`).join("")}</div>
        ${art.noteReso?`<div style="font-size:10px;color:#555;background:#fff5f5;padding:6px 8px;border-radius:4px;margin-top:6px">${art.noteReso}</div>`:""}
      </div>`:""}
      ${(art.dettaglioRese||[]).some(r=>r.articolo||r.taglia)?
        '<div style="margin-bottom:10px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#c0392b;margin-bottom:6px">Dettaglio paia rese</div><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th style="background:#fde8e8;color:#7b1a1a;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase">Articolo</th><th style="background:#fde8e8;color:#7b1a1a;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase">Taglia</th></tr></thead><tbody>'+(art.dettaglioRese||[]).filter(r=>r.articolo||r.taglia).map(r=>'<tr><td style="padding:5px 8px;border-bottom:1px solid #fde8e8;color:#333">'+( r.articolo||'—')+'</td><td style="padding:5px 8px;border-bottom:1px solid #fde8e8;color:#333;font-weight:700">'+(r.taglia||'—')+'</td></tr>').join('')+'</tbody></table></div>'
        :""}
      ${photos?`<div><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:8px">Foto difetti</div><div style="display:flex;flex-wrap:wrap;gap:6px">${photos}</div></div>`:""}
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QC ${r.calzaturificio}</title>
  <style>${PRINT_CSS}</style></head><body>
  ${BRAND_HEADER("Rapporto Controllo Qualita")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
    ${[["Calzaturificio",r.calzaturificio],["Controllore",r.controllore],["Data e ora",fmt(r.dataControllo)],["Articoli controllati",arts.length]].map(([l,v])=>`
    <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">${l}</div>
      <div style="font-size:20px;font-weight:700;color:#1a1a1a">${v}</div>
    </div>`).join("")}
  </div>
  <table style="width:100%;border-collapse:separate;border-spacing:6px 0;table-layout:fixed;margin-bottom:20px"><tr>
    ${[["Totale",totCtrl,"#1a1a1a","#f5f5f5"],["Conformi",totConf,"#27ae60","#eafaf1"],["Riparate",totRip,"#e67e22","#fff8e1"],["KO",totKO,"#c0392b","#fce4ec"],["Rese",totRese,"#e74c3c","#fde8e8"]].map(([l,n,c,bg])=>
    '<td style="width:20%;padding:4px"><div style="background:'+bg+';border-radius:8px;padding:10px;text-align:center"><div style="font-size:26px;font-weight:700;color:'+c+'">'+n+'</div><div style="font-size:9px;color:'+c+';text-transform:uppercase;font-weight:700;margin-top:2px">'+l+'</div>'+(l!=="Totale"&&totCtrl>0?'<div style="font-size:11px;color:'+c+';font-weight:700;margin-top:2px">'+Math.round(n/totCtrl*100)+'%</div>':'')+'</div></td>'
    ).join("")}
  </tr></table>
  <div style="margin-bottom:20px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px">Composizione lotto</div>
    <div style="height:16px;border-radius:6px;overflow:hidden;display:flex;border:1px solid #eee">
      <div style="background:#27ae60;width:${pConf}%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;overflow:hidden">${pConf>8?pConf+"%":""}</div>
      <div style="background:#e67e22;width:${totCtrl>0?Math.round(totRip/totCtrl*100):0}%;"></div>
      <div style="background:#c0392b;width:${totCtrl>0?Math.round(totKO/totCtrl*100):0}%;"></div>
      <div style="background:#e74c3c;width:${totCtrl>0?Math.round(totRese/totCtrl*100):0}%;"></div>
    </div>
    <div style="display:flex;gap:14px;margin-top:5px;font-size:9px;color:#666">
      <span style="color:#27ae60">&#9632; Conformi ${pConf}%</span>
      <span style="color:#e67e22">&#9632; Riparate ${totCtrl>0?Math.round(totRip/totCtrl*100):0}%</span>
      <span style="color:#c0392b">&#9632; KO ${totCtrl>0?Math.round(totKO/totCtrl*100):0}%</span>
      <span style="color:#e74c3c">&#9632; Rese ${totCtrl>0?Math.round(totRese/totCtrl*100):0}%</span>
    </div>
  </div>
  <div class="sec-title">Dettaglio articoli</div>
  ${artsHTML}
  <div style="margin-top:24px;border-top:1px solid #ddd;padding-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#aaa">
    <span>Mosaicon Shoes — Generato il ${new Date().toLocaleDateString("it-IT")} ore ${new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</span>
    <span style="background:#d4edda;color:#155724;padding:2px 10px;border-radius:4px;font-weight:700">DOCUMENTO UFFICIALE</span>
  </div>
  </body></html>`;
}

// ── PDF cumulativo ────────────────────────────────────────────────────────
function buildCumulativePDF(reports, filtro) {
  const totCtrl = reports.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaControllata)||0),0),0);
  const totConf = reports.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaConformi)||0),0),0);
  const totRip  = reports.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaRiparate)||0),0),0);
  const totKO   = reports.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaKO)||0),0),0);
  const totRese = reports.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(parseInt(x.qtaRese)||0),0),0);
  const avgConf = totCtrl>0?Math.round(totConf/totCtrl*100):0;

  const byFab={};
  reports.forEach(r=>{
    const fab=r.calzaturificio||"N/D";
    if(!byFab[fab]) byFab[fab]={reports:0,ctrl:0,conf:0,rip:0,ko:0,rese:0};
    byFab[fab].reports++;
    (r.articoli||[]).forEach(a=>{
      byFab[fab].ctrl  +=parseInt(a.qtaControllata)||0;
      byFab[fab].conf  +=parseInt(a.qtaConformi)||0;
      byFab[fab].rip   +=parseInt(a.qtaRiparate)||0;
      byFab[fab].ko    +=parseInt(a.qtaKO)||0;
      byFab[fab].rese  +=parseInt(a.qtaRese)||0;
    });
  });

  const fabRows=Object.entries(byFab).map(([fab,d])=>`
    <tr>
      <td style="padding:8px 10px;font-weight:700">${fab}</td>
      <td style="padding:8px 10px;text-align:center">${d.reports}</td>
      <td style="padding:8px 10px;text-align:center">${d.ctrl}</td>
      <td style="padding:8px 10px;text-align:center;color:#27ae60;font-weight:700">${d.conf} (${d.ctrl>0?Math.round(d.conf/d.ctrl*100):0}%)</td>
      <td style="padding:8px 10px;text-align:center;color:#e67e22">${d.rip}</td>
      <td style="padding:8px 10px;text-align:center;color:#c0392b">${d.ko}</td>
      <td style="padding:8px 10px;text-align:center;color:#e74c3c">${d.rese}</td>
    </tr>`).join("");

  const righeReport=reports.map(r=>{
    const rC=(r.articoli||[]).reduce((a,x)=>a+(parseInt(x.qtaControllata)||0),0);
    const rCo=(r.articoli||[]).reduce((a,x)=>a+(parseInt(x.qtaConformi)||0),0);
    return `<tr>
      <td style="padding:6px 10px">${fmtDate(r.dataControllo)}</td>
      <td style="padding:6px 10px;font-weight:500">${r.calzaturificio}</td>
      <td style="padding:6px 10px">${r.controllore}</td>
      <td style="padding:6px 10px;text-align:center">${(r.articoli||[]).length}</td>
      <td style="padding:6px 10px;text-align:center">${rC}</td>
      <td style="padding:6px 10px;text-align:center;color:#27ae60;font-weight:700">${rC>0?Math.round(rCo/rC*100)+"%":"—"}</td>
    </tr>`;
  }).join("");

  const dettaglio=reports.map(r=>{
    const artRows=(r.articoli||[]).map((a,i)=>{
      const qC=parseInt(a.qtaControllata)||0, qCo=parseInt(a.qtaConformi)||0;
      const qR=parseInt(a.qtaRiparate)||0, qK=parseInt(a.qtaKO)||0, qRe=parseInt(a.qtaRese)||0;
      return `<tr>
        <td style="padding:6px 10px;color:#333">${i+1}. ${a.modello}</td>
        <td style="padding:6px 10px;text-align:center">${qC}</td>
        <td style="padding:6px 10px;text-align:center;color:#27ae60;font-weight:700">${qCo} (${qC>0?Math.round(qCo/qC*100):0}%)</td>
        <td style="padding:6px 10px;text-align:center;color:#e67e22">${qR}</td>
        <td style="padding:6px 10px;text-align:center;color:#c0392b">${qK}</td>
        <td style="padding:6px 10px;text-align:center;color:#e74c3c">${qRe}</td>
        <td style="padding:6px 10px;font-size:9px;color:#666">${(a.difettiRiparati||[]).join(", ")||"—"}</td>
        <td style="padding:6px 10px;font-size:9px;color:#c0392b">${(a.motiviReso||[]).join(", ")||""}</td>
        <td style="padding:6px 10px;font-size:9px;color:#333">${(a.dettaglioRese||[]).filter(r=>r.articolo||r.taglia).map(r=>(r.articolo||"")+" tg."+(r.taglia||"")).join(", ")}</td>
      </tr>`;
    }).join("");
    return `<div style="margin-bottom:18px;page-break-inside:avoid">
      <div style="background:#f0f0f0;padding:8px 14px;border-radius:6px 6px 0 0;border:1px solid #ddd;border-bottom:none;display:flex;justify-content:space-between">
        <div style="font-weight:700;font-size:12px">${r.calzaturificio}</div>
        <div style="font-size:10px;color:#666">${r.controllore} &middot; ${fmtDate(r.dataControllo)}</div>
      </div>
      <table style="border:1px solid #ddd">
        <thead><tr style="background:#333">
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:left">Articolo</th>
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:center">Ctrl.</th>
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:center">Conformi</th>
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:center">Riparate</th>
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:center">KO</th>
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:center">Rese</th>
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:left">Difetti</th>
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:left">Motivi reso</th>
          <th style="color:#fff;padding:5px 10px;font-size:9px;text-align:left">Dettaglio rese</th>
        </tr></thead>
        <tbody>${artRows}</tbody>
      </table>
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Cumulativo — Mosaicon Shoes</title>
  <style>${PRINT_CSS}</style></head><body>
  ${BRAND_HEADER("Report Cumulativo — "+filtro)}
  <table style="width:100%;border-collapse:separate;border-spacing:6px 0;table-layout:fixed;margin-bottom:16px"><tr>
    ${[["Paia totali",totCtrl,"#1a1a1a","#f5f5f5"],["Conformi",totConf,"#27ae60","#eafaf1"],["Riparate",totRip,"#e67e22","#fff8e1"],["KO",totKO,"#c0392b","#fce4ec"],["Rese",totRese,"#e74c3c","#fde8e8"]].map(([l,n,c,bg])=>
    '<td style="width:20%;padding:4px"><div style="background:'+bg+';border-radius:8px;padding:10px;text-align:center"><div style="font-size:26px;font-weight:700;color:'+c+'">'+n+'</div><div style="font-size:9px;color:'+c+';text-transform:uppercase;font-weight:700;margin-top:2px">'+l+'</div>'+(l!=="Paia totali"&&totCtrl>0?'<div style="font-size:11px;color:'+c+';font-weight:700">'+Math.round(n/totCtrl*100)+'%</div>':'')+'</div></td>'
    ).join("")}
  </tr></table>
  <div style="font-size:11px;color:#555;margin-bottom:16px">Conformita media: <strong style="color:#27ae60">${avgConf}%</strong> &nbsp; Rapporti: <strong>${reports.length}</strong></div>
  <div class="sec-title">Riepilogo per calzaturificio</div>
  <table style="margin-bottom:4px"><thead><tr><th>Calzaturificio</th><th style="text-align:center">Rapporti</th><th style="text-align:center">Paia ctrl.</th><th style="text-align:center">Conformi</th><th style="text-align:center">Riparate</th><th style="text-align:center">KO</th><th style="text-align:center">Rese</th></tr></thead><tbody>${fabRows}</tbody></table>
  <div class="sec-title">Elenco rapporti</div>
  <table style="margin-bottom:4px"><thead><tr><th>Data</th><th>Calzaturificio</th><th>Controllore</th><th style="text-align:center">Articoli</th><th style="text-align:center">Paia ctrl.</th><th style="text-align:center">Conformita</th></tr></thead><tbody>${righeReport}</tbody></table>
  <div class="sec-title">Dettaglio articoli per rapporto</div>
  ${dettaglio}
  <div style="margin-top:24px;border-top:1px solid #ddd;padding-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#aaa">
    <span>Generato il ${new Date().toLocaleDateString("it-IT")} ore ${new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</span>
    <span style="background:#d4edda;color:#155724;padding:2px 10px;border-radius:4px;font-weight:700">MOSAICON SHOES — DOCUMENTO UFFICIALE</span>
  </div>
  </body></html>`;
}

// ── stili dark condivisi ──────────────────────────────────────────────────
const S = {
  page:    {background:D.bg, minHeight:"100vh", padding:"20px", color:D.text, fontFamily:"Arial,sans-serif"},
  card:    {background:D.surface, border:`1px solid ${D.border}`, borderRadius:12},
  label:   {fontSize:11, color:D.muted, textTransform:"uppercase", letterSpacing:".8px", marginBottom:4},
  input:   {background:D.bg, border:`1px solid ${D.border}`, borderRadius:8, padding:"9px 12px", fontSize:13, color:D.text, width:"100%", boxSizing:"border-box"},
  btn:     {background:D.blueAcc, color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontSize:13, fontWeight:700, cursor:"pointer"},
  btnGhost:{background:"transparent", color:D.muted, border:`1px solid ${D.border}`, borderRadius:8, padding:"7px 14px", fontSize:12, cursor:"pointer"},
  btnDanger:{background:"transparent", color:D.red, border:`1px solid ${D.red}`, borderRadius:8, padding:"6px 12px", fontSize:12, cursor:"pointer"},
};

function pctColor(p) { return p>=90?D.green:p>=70?D.amber:D.red; }
function pctBg(p)    { return p>=90?D.greenBg:p>=70?D.amberBg:D.redBg; }
function pctLabel(p) { return p>=90?"OK":p>=70?"WARN":"KO"; }

// ── componenti dark ───────────────────────────────────────────────────────
function DCard({children, style={}}) {
  return <div style={{...S.card, padding:"16px 18px", marginBottom:14, ...style}}>{children}</div>;
}
function SectionTitle({children}) {
  return <div style={{fontSize:11, fontWeight:700, color:D.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:14}}>{children}</div>;
}
function Fld({label, children}) {
  return (
    <div style={{marginBottom:12}}>
      <div style={S.label}>{label}</div>
      {children}
    </div>
  );
}
function TagBtn({label, active, color, onClick}) {
  const bg   = active ? (color==="warning"?D.amberBg:D.redBg) : D.bg;
  const col  = active ? (color==="warning"?D.amber:D.red) : D.muted;
  const bord = active ? (color==="warning"?D.amber:D.red) : D.border;
  return (
    <button onClick={onClick} style={{padding:"4px 10px", borderRadius:6, border:`0.5px solid ${bord}`, cursor:"pointer", fontSize:11, fontWeight:400, background:bg, color:col, marginBottom:4}}>
      {label}
    </button>
  );
}
function Toast({t}) {
  const ok = t.ok !== false;
  return (
    <div style={{position:"fixed", top:16, right:16, zIndex:9999,
      background: ok ? D.greenBg : D.redBg,
      color: ok ? D.green : D.red,
      border:`1px solid ${ok?D.green:D.red}`,
      borderRadius:10, padding:"10px 18px", fontSize:13, fontWeight:700, maxWidth:340}}>
      {t.msg}
    </div>
  );
}

// ── barra conformita ──────────────────────────────────────────────────────
function ConfBar({pct, label, value}) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:"flex", justifyContent:"space-between", marginBottom:4}}>
        <span style={{fontSize:12, color:D.muted}}>{label}</span>
        <span style={{fontSize:12, fontWeight:700, color:pctColor(pct)}}>{value} · {pct}%</span>
      </div>
      <div style={{background:D.bg, borderRadius:4, height:6, overflow:"hidden"}}>
        <div style={{background:pctColor(pct), width:pct+"%", height:6, borderRadius:4}}/>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]               = useState("list");
  const [reports, setReports]         = useState([]);
  const [selected, setSelected]       = useState(null);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);
  const [dbReady, setDbReady]         = useState(false);
  const [filterFab, setFilterFab]     = useState("tutti");
  const [filterPeriod, setFilterPeriod] = useState("tutti");
  const [filterArt, setFilterArt]     = useState("");
  const [cumulPeriod, setCumulPeriod] = useState("settimana");
  const dbRef    = useRef(null);
  const fileRefs = useRef({});

  const blankForm = {controllore:"", calzaturificio:"", dataControllo:new Date().toISOString().slice(0,16), articoli:[{...BLANK_ARTICOLO}]};
  const [form, setForm] = useState(blankForm);

  useEffect(()=>{
    try {
      const ok = FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.includes("INCOLLA");
      if (!ok) return;
      const app = initializeApp(FIREBASE_CONFIG);
      const db  = getDatabase(app);
      dbRef.current = ref(db,"rapporti_v2");
      setDbReady(true);
      onValue(dbRef.current, snap=>{
        const data=snap.val();
        if (data) {
          const list=Object.entries(data).map(([fbKey,v])=>({...v,fbKey}));
          list.sort((a,b)=>(b.ts||0)-(a.ts||0));
          setReports(list);
        } else setReports([]);
      });
    } catch(e){}
  },[]);

  function showToast(msg,ok=true){setToast({msg,ok});setTimeout(()=>setToast(null),3500);}
  function tog(arr,v){return arr.includes(v)?arr.filter(x=>x!==v):[...arr,v];}
  function setArt(idx,f,v){setForm(fm=>{const a=[...fm.articoli];a[idx]={...a[idx],[f]:v};return{...fm,articoli:a};});}
  function addArt(){setForm(f=>({...f,articoli:[...f.articoli,{...BLANK_ARTICOLO}]}));}
  function remArt(idx){setForm(f=>({...f,articoli:f.articoli.filter((_,i)=>i!==idx)}));}

  async function onPhoto(artIdx,e){
    const files=Array.from(e.target.files);
    const comp=await Promise.all(files.map(f=>compressImage(f)));
    setForm(f=>{const a=[...f.articoli];a[artIdx]={...a[artIdx],fotoDifetti:[...(a[artIdx].fotoDifetti||[]),...comp]};return{...f,articoli:a};});
    e.target.value="";
  }

  async function submit(){
    if(!form.controllore.trim()||!form.calzaturificio.trim()){showToast("Compila controllore e calzaturificio",false);return;}
    if(!form.articoli[0]?.modello?.trim()){showToast("Aggiungi almeno un articolo",false);return;}
    setSaving(true);
    const rep={...form, id:Date.now().toString().slice(-7), ts:Date.now(),
      articoli:form.articoli.map(a=>({...a,
        qtaControllata:parseInt(a.qtaControllata)||0,qtaConformi:parseInt(a.qtaConformi)||0,
        qtaRiparate:parseInt(a.qtaRiparate)||0,qtaKO:parseInt(a.qtaKO)||0,qtaRese:parseInt(a.qtaRese)||0,
      }))
    };
    try {
      if(dbReady&&dbRef.current){await push(dbRef.current,rep);showToast("Rapporto salvato e sincronizzato");}
      else showToast("Firebase non configurato",false);
    } catch(e){showToast("Errore: "+e.message,false);}
    setSaving(false);
    setForm(blankForm);
    setView("list");
  }

  async function delReport(r){
    if(!confirm("Eliminare questo rapporto?"))return;
    try {
      if(dbReady&&r.fbKey){const app=initializeApp(FIREBASE_CONFIG);const db=getDatabase(app);await remove(ref(db,"rapporti_v2/"+r.fbKey));}
      showToast("Rapporto eliminato");setView("list");
    } catch(e){showToast("Errore: "+e.message,false);}
  }

  const allFabs=[...new Set(reports.map(r=>r.calzaturificio).filter(Boolean))].sort();

  const filtered=reports.filter(r=>{
    if(filterFab!=="tutti"&&r.calzaturificio!==filterFab)return false;
    if(filterArt&&!(r.articoli||[]).some(a=>a.modello?.toLowerCase().includes(filterArt.toLowerCase())))return false;
    if(filterPeriod!=="tutti"){
      const now=new Date();
      if(filterPeriod==="settimana"&&getYearWeek(r.dataControllo)!==getYearWeek(now.toISOString()))return false;
      if(filterPeriod==="mese"&&getYearMonth(r.dataControllo)!==getYearMonth(now.toISOString()))return false;
    }
    return true;
  });

  function exportCumul(){
    const now=new Date();
    let reps=[...reports]; let label="Tutti i periodi";
    if(filterFab!=="tutti")reps=reps.filter(r=>r.calzaturificio===filterFab);
    if(cumulPeriod==="settimana"){reps=reps.filter(r=>getYearWeek(r.dataControllo)===getYearWeek(now.toISOString()));label="Settimana corrente";}
    else if(cumulPeriod==="mese"){reps=reps.filter(r=>getYearMonth(r.dataControllo)===getYearMonth(now.toISOString()));label="Mese corrente";}
    if(!reps.length){showToast("Nessun rapporto nel periodo",false);return;}
    openPrint(buildCumulativePDF(reps,label+(filterFab!=="tutti"?" — "+filterFab:"")));
  }

  const totCtrl=filtered.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(x.qtaControllata||0),0),0);
  const totConf=filtered.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(x.qtaConformi||0),0),0);
  const totKO  =filtered.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(x.qtaKO||0),0),0);
  const totRese=filtered.reduce((a,r)=>a+(r.articoli||[]).reduce((b,x)=>b+(x.qtaRese||0),0),0);
  const avgConf=totCtrl>0?Math.round(totConf/totCtrl*100):0;

  // ── stats per calzaturificio (per le barre) ───────────────────────────
  const statsByFab = {};
  filtered.forEach(r=>{
    const fab=r.calzaturificio||"N/D";
    if(!statsByFab[fab]) statsByFab[fab]={ctrl:0,conf:0};
    (r.articoli||[]).forEach(a=>{statsByFab[fab].ctrl+=a.qtaControllata||0;statsByFab[fab].conf+=a.qtaConformi||0;});
  });
  const fabStats=Object.entries(statsByFab).map(([fab,d])=>({fab,pct:d.ctrl>0?Math.round(d.conf/d.ctrl*100):0,ctrl:d.ctrl})).sort((a,b)=>b.pct-a.pct);

  // ── DETAIL ────────────────────────────────────────────────────────────
  if(view==="detail"&&selected){
    const r=selected;
    const totC=(r.articoli||[]).reduce((a,x)=>a+(x.qtaControllata||0),0);
    const totCo=(r.articoli||[]).reduce((a,x)=>a+(x.qtaConformi||0),0);
    const pConf=totC>0?Math.round(totCo/totC*100):0;
    return(
      <div style={{...S.page, paddingBottom:60}}>
        {toast&&<Toast t={toast}/>}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>
          <button onClick={()=>setView("list")} style={S.btnGhost}>← Lista</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:18,color:D.text}}>{r.calzaturificio}</div>
            <div style={{fontSize:12,color:D.muted,marginTop:2}}>{r.controllore} · {fmt(r.dataControllo)}</div>
          </div>
          <button onClick={()=>openPrint(buildPDF(r))} style={S.btn}>Stampa PDF</button>
          <button onClick={()=>delReport(r)} style={S.btnDanger}>Elimina</button>
        </div>

        {/* KPI riepilogo */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
          {[["Controllate",totC,D.text,"transparent","none"],
            ["Conformi",totCo,D.green,D.greenBg,`3px solid ${D.green}`],
            [(r.articoli||[]).reduce((a,x)=>a+(x.qtaRiparate||0),0),"Riparate",D.amber,D.amberBg,`3px solid ${D.amber}`],
            [(r.articoli||[]).reduce((a,x)=>a+(x.qtaKO||0),0),"KO",D.red,D.redBg,`3px solid ${D.red}`],
            [(r.articoli||[]).reduce((a,x)=>a+(x.qtaRese||0),0),"Rese",D.red,D.redBg,`3px solid ${D.red}`],
          ].map(([n,l,c,bg,bt],i)=>(
            <div key={i} style={{...S.card,padding:"14px 8px",textAlign:"center",borderTop:bt,background:bg}}>
              <div style={{fontSize:26,fontWeight:700,color:c}}>{n}</div>
              <div style={{fontSize:10,color:D.muted,marginTop:3}}>{l}</div>
              {i>0&&totC>0&&<div style={{fontSize:10,color:c,marginTop:2,fontWeight:700}}>{Math.round(n/totC*100)}%</div>}
            </div>
          ))}
        </div>

        {/* barra stacked */}
        <DCard>
          <SectionTitle>Composizione lotto</SectionTitle>
          <div style={{height:16,borderRadius:6,overflow:"hidden",display:"flex"}}>
            <div style={{background:D.green,width:pConf+"%",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10,fontWeight:700,overflow:"hidden"}}>{pConf>8?pConf+"%":""}</div>
            <div style={{background:D.amber,width:totC>0?Math.round((r.articoli||[]).reduce((a,x)=>a+(x.qtaRiparate||0),0)/totC*100):0+"%"}}/>
            <div style={{background:D.red,width:totC>0?Math.round(((r.articoli||[]).reduce((a,x)=>a+(x.qtaKO||0),0)+(r.articoli||[]).reduce((a,x)=>a+(x.qtaRese||0),0))/totC*100):0+"%"}}/>
          </div>
          <div style={{display:"flex",gap:14,marginTop:6,fontSize:11}}>
            <span style={{color:D.green}}>● Conformi {pConf}%</span>
            <span style={{color:D.amber}}>● Riparate {totC>0?Math.round((r.articoli||[]).reduce((a,x)=>a+(x.qtaRiparate||0),0)/totC*100):0}%</span>
            <span style={{color:D.red}}>● KO+Rese {totC>0?Math.round(((r.articoli||[]).reduce((a,x)=>a+(x.qtaKO||0),0)+(r.articoli||[]).reduce((a,x)=>a+(x.qtaRese||0),0))/totC*100):0}%</span>
          </div>
        </DCard>

        {/* articoli */}
        {(r.articoli||[]).map((art,idx)=>{
          const qC=art.qtaControllata||0;
          return(
            <DCard key={idx}>
              <div style={{fontWeight:700,fontSize:15,color:D.text,marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${D.border}`}}>
                Articolo {idx+1} — {art.modello}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:10}}>
                {[["Ctrl.",qC,D.text],["Conf.",art.qtaConformi||0,D.green],["Rip.",art.qtaRiparate||0,D.amber],["KO",art.qtaKO||0,D.red],["Rese",art.qtaRese||0,D.red]].map(([l,n,c],i)=>(
                  <div key={i} style={{background:D.bg,borderRadius:8,padding:"10px 4px",textAlign:"center",border:`1px solid ${D.border}`}}>
                    <div style={{fontSize:20,fontWeight:700,color:c}}>{n}</div>
                    <div style={{fontSize:10,color:D.muted,marginTop:2}}>{l}</div>
                    {i>0&&qC>0&&<div style={{fontSize:9,color:c,marginTop:1}}>{Math.round(n/qC*100)}%</div>}
                  </div>
                ))}
              </div>
              {(art.difettiRiparati||[]).length>0&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,fontWeight:700,color:D.amber,textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Difetti riparati</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {art.difettiRiparati.map(d=><span key={d} style={{background:D.amberBg,color:D.amber,borderRadius:5,padding:"3px 8px",fontSize:11}}>{d}</span>)}
                  </div>
                  {art.noteDifetti&&<div style={{fontSize:12,color:D.muted,background:D.bg,borderRadius:6,padding:8,marginTop:6,border:`1px solid ${D.border}`}}>{art.noteDifetti}</div>}
                </div>
              )}
              {(art.motiviReso||[]).length>0&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,fontWeight:700,color:D.red,textTransform:"uppercase",letterSpacing:.8,marginBottom:5}}>Motivi reso</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {art.motiviReso.map(d=><span key={d} style={{background:D.redBg,color:D.red,borderRadius:5,padding:"3px 8px",fontSize:11}}>{d}</span>)}
                  </div>
                  {art.noteReso&&<div style={{fontSize:12,color:D.muted,background:D.bg,borderRadius:6,padding:8,marginTop:6,border:`1px solid ${D.border}`}}>{art.noteReso}</div>}
                </div>
              )}
              {(art.dettaglioRese||[]).some(r=>r.articolo||r.taglia)&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,fontWeight:700,color:D.red,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Dettaglio paia rese</div>
                  <div style={{background:D.bg,borderRadius:8,border:`1px solid ${D.border}`,overflow:"hidden"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",background:D.border}}>
                      <div style={{padding:"6px 12px",fontSize:10,fontWeight:700,color:D.muted,textTransform:"uppercase",letterSpacing:.8,background:D.surface}}>Articolo</div>
                      <div style={{padding:"6px 12px",fontSize:10,fontWeight:700,color:D.muted,textTransform:"uppercase",letterSpacing:.8,background:D.surface}}>Taglia</div>
                    </div>
                    {(art.dettaglioRese||[]).filter(r=>r.articolo||r.taglia).map((r,i)=>(
                      <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:`1px solid ${D.border}`}}>
                        <div style={{padding:"8px 12px",fontSize:13,color:D.text}}>{r.articolo||"—"}</div>
                        <div style={{padding:"8px 12px",fontSize:13,color:D.text,fontWeight:600}}>{r.taglia||"—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(art.fotoDifetti||[]).length>0&&(
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:D.muted,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Foto difetti ({art.fotoDifetti.length})</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {art.fotoDifetti.map((p,i)=>(
                      <div key={i} style={{textAlign:"center"}}>
                        <img src={p.data} alt={p.nome} style={{width:140,height:105,objectFit:"cover",borderRadius:8,border:`1px solid ${D.border}`}}/>
                        <div style={{fontSize:10,color:D.muted,marginTop:3,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.nome}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </DCard>
          );
        })}
      </div>
    );
  }

  // ── FORM ─────────────────────────────────────────────────────────────────
  if(view==="form"){
    return(
      <div style={{...S.page, paddingBottom:80}}>
        {toast&&<Toast t={toast}/>}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <button onClick={()=>setView("list")} style={S.btnGhost}>← Annulla</button>
          <h2 style={{margin:0,fontSize:18,fontWeight:700,color:D.text,letterSpacing:1}}>Nuovo controllo qualita</h2>
        </div>

        <DCard>
          <SectionTitle>Dati generali</SectionTitle>
          <Fld label="Calzaturificio *">
            <input value={form.calzaturificio} onChange={e=>setForm(f=>({...f,calzaturificio:e.target.value}))} placeholder="Nome del calzaturificio" style={S.input}/>
          </Fld>
          <Fld label="Controllore *">
            <input value={form.controllore} onChange={e=>setForm(f=>({...f,controllore:e.target.value}))} placeholder="Nome del controllore" style={S.input}/>
          </Fld>
          <Fld label="Data e ora">
            <input type="datetime-local" value={form.dataControllo} onChange={e=>setForm(f=>({...f,dataControllo:e.target.value}))} style={S.input}/>
          </Fld>
        </DCard>

        {form.articoli.map((art,idx)=>{
          const qC=parseInt(art.qtaControllata)||0, qCo=parseInt(art.qtaConformi)||0;
          const qR=parseInt(art.qtaRiparate)||0, qK=parseInt(art.qtaKO)||0, qRe=parseInt(art.qtaRese)||0;
          const frRef=el=>{if(el)fileRefs.current[idx]=el;};
          return(
            <div key={idx} style={{...S.card, padding:"16px 18px", marginBottom:14, borderTop:`3px solid ${D.blueAcc}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:D.blue,textTransform:"uppercase",letterSpacing:1}}>Articolo {idx+1}</div>
                {form.articoli.length>1&&<button onClick={()=>remArt(idx)} style={S.btnDanger}>Rimuovi</button>}
              </div>
              <Fld label="Modello / Articolo *">
                <input value={art.modello} onChange={e=>setArt(idx,"modello",e.target.value)} placeholder="Es. Derby Classic cod. AB123" style={S.input}/>
              </Fld>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:10}}>
                {[["Controllate *","qtaControllata"],["Conformi","qtaConformi"],["Riparate","qtaRiparate"],["KO","qtaKO"],["Rese","qtaRese"]].map(([l,f])=>(
                  <Fld key={f} label={l}>
                    <input type="number" min="0" value={art[f]} onChange={e=>setArt(idx,f,e.target.value)} placeholder="0"
                      style={{...S.input, padding:"6px 8px", textAlign:"center"}}/>
                  </Fld>
                ))}
              </div>
              {qC>0&&(
                <div style={{background:D.bg,borderRadius:8,padding:"7px 12px",fontSize:12,color:D.muted,marginBottom:10,border:`1px solid ${D.border}`}}>
                  Totale inserito: <strong style={{color:D.text}}>{qCo+qR+qK+qRe}</strong> / {qC}
                  &nbsp;·&nbsp; Conformita: <strong style={{color:qCo/qC>=.9?D.green:D.amber}}>{qC>0?Math.round(qCo/qC*100):0}%</strong>
                </div>
              )}
              {qR>0&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:D.amber,fontWeight:700,marginBottom:6}}>Difetti riparati</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                    {DIFETTI_COMUNI.map(d=><TagBtn key={d} label={d} active={(art.difettiRiparati||[]).includes(d)} color="warning" onClick={()=>setArt(idx,"difettiRiparati",tog(art.difettiRiparati||[],d))}/>)}
                  </div>
                  <textarea value={art.noteDifetti} onChange={e=>setArt(idx,"noteDifetti",e.target.value)} placeholder="Note difetti..." rows={2}
                    style={{...S.input, resize:"vertical"}}/>
                </div>
              )}
              {qRe>0&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:D.red,fontWeight:700,marginBottom:6}}>Motivi reso</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                    {PROBLEMI_RESO.map(d=><TagBtn key={d} label={d} active={(art.motiviReso||[]).includes(d)} color="danger" onClick={()=>setArt(idx,"motiviReso",tog(art.motiviReso||[],d))}/>)}
                  </div>
                  <textarea value={art.noteReso} onChange={e=>setArt(idx,"noteReso",e.target.value)} placeholder="Note reso..." rows={2}
                    style={{...S.input, resize:"vertical", marginBottom:8}}/>
                  <div style={{fontSize:11,color:D.red,fontWeight:700,marginBottom:8}}>Dettaglio paia rese</div>
                  {(art.dettaglioRese||[{articolo:"",taglia:""}]).map((riga,ri)=>(
                    <div key={ri} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                      <input value={riga.articolo} onChange={e=>{
                        const dr=[...(art.dettaglioRese||[{articolo:"",taglia:""}])];
                        dr[ri]={...dr[ri],articolo:e.target.value};
                        setArt(idx,"dettaglioRese",dr);
                      }} placeholder="Articolo / modello" style={{...S.input,flex:2}}/>
                      <input value={riga.taglia} onChange={e=>{
                        const dr=[...(art.dettaglioRese||[{articolo:"",taglia:""}])];
                        dr[ri]={...dr[ri],taglia:e.target.value};
                        setArt(idx,"dettaglioRese",dr);
                      }} placeholder="Taglia" style={{...S.input,flex:1}}/>
                      {(art.dettaglioRese||[]).length>1&&(
                        <button onClick={()=>{
                          const dr=(art.dettaglioRese||[]).filter((_,i)=>i!==ri);
                          setArt(idx,"dettaglioRese",dr);
                        }} style={{background:"none",border:"none",color:D.red,cursor:"pointer",fontSize:18,padding:"0 4px",flexShrink:0}}>×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={()=>{
                    const dr=[...(art.dettaglioRese||[{articolo:"",taglia:""}]),{articolo:"",taglia:""}];
                    setArt(idx,"dettaglioRese",dr);
                  }} style={{background:"none",border:`1px dashed ${D.border}`,borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:12,color:D.muted,width:"100%",marginTop:2}}>
                    + Aggiungi altro reso
                  </button>
                </div>
              )}
              <button onClick={()=>fileRefs.current[idx]?.click()} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderRadius:8,border:`1px dashed ${D.border}`,background:D.bg,cursor:"pointer",fontSize:12,color:D.muted,width:"100%",justifyContent:"center"}}>
                + Foto difetti {art.fotoDifetti?.length>0&&`(${art.fotoDifetti.length})`}
              </button>
              <input ref={frRef} type="file" accept="image/*" multiple onChange={e=>onPhoto(idx,e)} style={{display:"none"}}/>
              {(art.fotoDifetti||[]).length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                  {art.fotoDifetti.map((p,i)=>(
                    <div key={i} style={{position:"relative"}}>
                      <img src={p.data} alt={p.nome} style={{width:80,height:60,objectFit:"cover",borderRadius:6,border:`1px solid ${D.border}`}}/>
                      <button onClick={()=>setArt(idx,"fotoDifetti",art.fotoDifetti.filter((_,j)=>j!==i))} style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,.8)",color:"#fff",border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>x</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button onClick={addArt} style={{width:"100%",padding:"11px",borderRadius:10,border:`1px dashed ${D.border}`,background:D.surface,color:D.muted,fontSize:14,cursor:"pointer",marginBottom:12}}>
          + Aggiungi articolo
        </button>
        <button onClick={submit} disabled={saving} style={{...S.btn, width:"100%", padding:"14px", borderRadius:10, fontSize:15, opacity:saving?.6:1}}>
          {saving?"Salvataggio...":"Salva rapporto"}
        </button>
      </div>
    );
  }

  // ── LIST / DASHBOARD ──────────────────────────────────────────────────────
  return(
    <div style={{...S.page, paddingBottom:40}}>
      {toast&&<Toast t={toast}/>}

      {/* topbar */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:24,paddingBottom:16,borderBottom:`1px solid ${D.border}`}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,letterSpacing:"3px",color:D.text}}>MOSAICON SHOES</div>
          <div style={{fontSize:10,color:D.muted,marginTop:3,letterSpacing:"2px"}}>QUALITY CONTROL DASHBOARD</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {dbReady&&<div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:D.green}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:D.green}}/>
            <span>Sincronizzato</span>
          </div>}
          <button onClick={()=>setView("form")} style={S.btn}>+ Nuovo</button>
        </div>
      </div>

      {/* KPI */}
      {reports.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
          {[
            ["Rapporti",filtered.length,D.blue,D.blueBg,D.blueAcc],
            ["Paia ctrl.",totCtrl,D.text,"transparent","none"],
            [avgConf+"%","Conformita",D.green,D.greenBg,D.green],
            [totKO,"Paia KO",D.amber,D.amberBg,D.amber],
            [totRese,"Paia rese",D.red,D.redBg,D.red],
          ].map(([v,l,c,bg,bt],i)=>(
            <div key={i} style={{...S.card, padding:"16px 14px", textAlign:"center", borderTop:`3px solid ${bt}`, background:bg}}>
              <div style={{fontSize:28,fontWeight:700,color:c,lineHeight:1}}>{v}</div>
              <div style={{fontSize:10,color:D.muted,marginTop:6,textTransform:"uppercase",letterSpacing:".8px"}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* filtri + export */}
      {reports.length>0&&(
        <DCard style={{marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
            {[["Calzaturificio",filterFab,setFilterFab,[["tutti","Tutti"],...allFabs.map(f=>[f,f])]],
              ["Periodo",filterPeriod,setFilterPeriod,[["tutti","Tutti"],["settimana","Questa settimana"],["mese","Questo mese"]]],
            ].map(([l,val,setter,opts])=>(
              <div key={l}>
                <div style={S.label}>{l}</div>
                <select value={val} onChange={e=>setter(e.target.value)} style={{...S.input,cursor:"pointer"}}>
                  {opts.map(([v,t])=><option key={v} value={v}>{t}</option>)}
                </select>
              </div>
            ))}
            <div>
              <div style={S.label}>Articolo</div>
              <input value={filterArt} onChange={e=>setFilterArt(e.target.value)} placeholder="Cerca articolo..." style={S.input}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:`1px solid ${D.border}`,paddingTop:12}}>
            <div style={{fontSize:12,color:D.muted}}>{filtered.length} rapporti trovati</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <select value={cumulPeriod} onChange={e=>setCumulPeriod(e.target.value)} style={{...S.input,width:"auto",fontSize:12,padding:"5px 10px"}}>
                <option value="settimana">Settimana</option>
                <option value="mese">Mese</option>
                <option value="tutti">Tutti</option>
              </select>
              <button onClick={exportCumul} style={{...S.btnGhost,color:D.blue,borderColor:D.blue,whiteSpace:"nowrap"}}>
                Esporta cumulativo
              </button>
            </div>
          </div>
        </DCard>
      )}

      {/* charts + lista */}
      {filtered.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginBottom:16}}>
          {/* barre conformita per calzaturificio */}
          <DCard style={{padding:"16px 18px"}}>
            <SectionTitle>Conformita per calzaturificio</SectionTitle>
            {fabStats.slice(0,6).map(({fab,pct,ctrl})=>(
              <ConfBar key={fab} label={fab} pct={pct} value={ctrl+" paia"}/>
            ))}
            {fabStats.length===0&&<div style={{color:D.muted,fontSize:13}}>Nessun dato</div>}
            {/* stacked bar totale */}
            {totCtrl>0&&(
              <div style={{marginTop:16, borderTop:`1px solid ${D.border}`, paddingTop:14}}>
                <div style={{fontSize:10,color:D.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Composizione lotto totale</div>
                <div style={{height:12,borderRadius:6,overflow:"hidden",display:"flex"}}>
                  <div style={{background:D.green,width:Math.round(totConf/totCtrl*100)+"%",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:700,overflow:"hidden"}}>{Math.round(totConf/totCtrl*100)>12?Math.round(totConf/totCtrl*100)+"%":""}</div>
                  <div style={{background:D.amber,width:Math.round((totCtrl-totConf-totKO-totRese)/totCtrl*100)+"%"}}/>
                  <div style={{background:D.red,width:Math.round((totKO+totRese)/totCtrl*100)+"%"}}/>
                </div>
                <div style={{display:"flex",gap:12,marginTop:6,fontSize:10,color:D.muted}}>
                  <span style={{color:D.green}}>● Conformi {Math.round(totConf/totCtrl*100)}%</span>
                  <span style={{color:D.amber}}>● Riparate {Math.round((totCtrl-totConf-totKO-totRese)/totCtrl*100)}%</span>
                  <span style={{color:D.red}}>● KO+Rese {Math.round((totKO+totRese)/totCtrl*100)}%</span>
                </div>
              </div>
            )}
          </DCard>

          {/* rapporti recenti */}
          <DCard style={{padding:"16px 18px"}}>
            <SectionTitle>Rapporti recenti</SectionTitle>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {filtered.slice(0,5).map(r=>{
                const totC=(r.articoli||[]).reduce((a,x)=>a+(x.qtaControllata||0),0);
                const totCo=(r.articoli||[]).reduce((a,x)=>a+(x.qtaConformi||0),0);
                const pct=totC>0?Math.round(totCo/totC*100):0;
                return(
                  <div key={r.fbKey||r.id} onClick={()=>{setSelected(r);setView("detail");}}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${D.border}`,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=".8"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:pctBg(pct),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:12,fontWeight:700,color:pctColor(pct)}}>{pct}%</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.calzaturificio}</div>
                      <div style={{fontSize:11,color:D.muted,marginTop:2}}>{r.controllore} · {fmtDate(r.dataControllo)}</div>
                      <div style={{fontSize:10,color:D.muted,marginTop:1}}>{(r.articoli||[]).length} articoli · {totC} paia</div>
                    </div>
                    <span style={{background:pctBg(pct),color:pctColor(pct),borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,flexShrink:0}}>{pctLabel(pct)}</span>
                  </div>
                );
              })}
            </div>
          </DCard>
        </div>
      )}

      {/* lista completa */}
      {filtered.length>0&&(
        <DCard style={{padding:"16px 18px"}}>
          <SectionTitle>Tutti i rapporti ({filtered.length})</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filtered.map(r=>{
              const totC=(r.articoli||[]).reduce((a,x)=>a+(x.qtaControllata||0),0);
              const totCo=(r.articoli||[]).reduce((a,x)=>a+(x.qtaConformi||0),0);
              const pct=totC>0?Math.round(totCo/totC*100):0;
              const nFoto=(r.articoli||[]).reduce((a,x)=>a+(x.fotoDifetti?.length||0),0);
              return(
                <div key={r.fbKey||r.id} onClick={()=>{setSelected(r);setView("detail");}}
                  style={{background:D.surface,border:`1px solid ${D.border}`,borderRadius:10,padding:"12px 14px",cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=D.muted}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=D.border}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:48,height:48,borderRadius:"50%",background:pctBg(pct),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:13,fontWeight:700,color:pctColor(pct)}}>{pct}%</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,color:D.text}}>{r.calzaturificio}</div>
                      <div style={{fontSize:12,color:D.muted,marginTop:2}}>{r.controllore} · {fmtDate(r.dataControllo)}</div>
                      <div style={{fontSize:11,color:D.muted,marginTop:1}}>{(r.articoli||[]).length} articoli</div>
                    </div>
                    <span style={{color:D.muted,fontSize:20,flexShrink:0}}>›</span>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10,paddingTop:10,borderTop:`1px solid ${D.border}`}}>
                    <span style={{background:D.bg,color:D.muted,borderRadius:6,padding:"4px 10px",fontSize:12}}>{totC} controllate</span>
                    <span style={{background:D.greenBg,color:D.green,borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:600}}>{totCo} conformi</span>
                    {(r.articoli||[]).reduce((a,x)=>a+(x.qtaKO||0),0)>0&&<span style={{background:D.redBg,color:D.red,borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:600}}>{(r.articoli||[]).reduce((a,x)=>a+(x.qtaKO||0),0)} KO</span>}
                    {(r.articoli||[]).reduce((a,x)=>a+(x.qtaRese||0),0)>0&&<span style={{background:D.redBg,color:D.red,borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:600}}>{(r.articoli||[]).reduce((a,x)=>a+(x.qtaRese||0),0)} rese</span>}
                    {nFoto>0&&<span style={{background:D.bg,color:D.muted,borderRadius:6,padding:"4px 10px",fontSize:12}}>{nFoto} foto</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </DCard>
      )}

      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"80px 20px",color:D.muted}}>
          <div style={{fontSize:48,marginBottom:16}}>👟</div>
          <div style={{fontSize:16,fontWeight:700,color:D.text}}>Nessun rapporto</div>
          <div style={{fontSize:13,marginTop:6}}>{reports.length>0?"Prova a cambiare i filtri":"Tocca Nuovo per iniziare"}</div>
        </div>
      )}
    </div>
  );
}
