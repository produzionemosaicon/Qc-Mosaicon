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

function fmt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

// ── stampa PDF via blob URL (funziona su mobile) ──────────────────────────
function printReport(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (win) {
    win.onload = () => {
      setTimeout(() => { win.print(); }, 500);
    };
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = "rapporto-qc.html";
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── riduce foto prima del salvataggio ────────────────────────────────────
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve({ data: canvas.toDataURL("image/jpeg", 0.7), nome: file.name });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function buildPDF(r, all) {
  const ok    = r.qtaControllata - r.qtaRiparata - r.qtaResa;
  const pOk   = r.qtaControllata > 0 ? Math.round(ok / r.qtaControllata * 100) : 0;
  const pRip  = r.qtaControllata > 0 ? Math.round(r.qtaRiparata / r.qtaControllata * 100) : 0;
  const pReso = r.qtaControllata > 0 ? Math.round(r.qtaResa / r.qtaControllata * 100) : 0;
  const tC    = all.reduce((a,x) => a + x.qtaControllata, 0);
  const tOk   = all.reduce((a,x) => a + x.qtaControllata - x.qtaRiparata - x.qtaResa, 0);
  const tRip  = all.reduce((a,x) => a + x.qtaRiparata, 0);
  const tReso = all.reduce((a,x) => a + x.qtaResa, 0);
  const avg   = tC > 0 ? Math.round(tOk / tC * 100) : 0;
  const photos = (r.fotoDifetti || []).map((p, i) =>
    `<div style="display:inline-block;text-align:center;margin:4px">
      <img src="${p.data}" style="max-width:160px;max-height:120px;border:1px solid #ccc;border-radius:5px;display:block"/>
      <div style="font-size:9px;color:#777;margin-top:3px">${p.nome || "Foto " + (i + 1)}</div>
    </div>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QC ${r.modello} #${r.id}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:20px}
    .hdr{background:#1a1a2e;color:#fff;padding:16px 20px;border-radius:7px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
    .hdr h1{font-size:16px;font-weight:700;letter-spacing:1.5px;margin-top:3px}
    .hdr .sub{font-size:10px;opacity:.6}
    .hdr .rid{font-size:24px;font-weight:700;opacity:.35}
    .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
    .card{background:#f4f4f8;border:1px solid #ddd;border-radius:6px;padding:9px 10px;text-align:center}
    .card .n{font-size:22px;font-weight:700}
    .card .l{font-size:9px;color:#555;margin-top:2px;text-transform:uppercase}
    .bar{background:#e0e0e8;border-radius:3px;height:6px;margin-top:5px}
    .bar div{height:6px;border-radius:3px}
    .bpct{font-size:9px;font-weight:700;margin-top:2px}
    .stk{height:18px;border-radius:5px;overflow:hidden;display:flex;border:1px solid #e0e0e8;margin-bottom:5px}
    .stk div{display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;overflow:hidden;white-space:nowrap}
    .leg{display:flex;gap:14px;font-size:9px;color:#666;margin-bottom:12px}
    .sec{margin-bottom:13px}
    .sec h3{font-size:10px;font-weight:700;color:#1a1a2e;text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid #1a1a2e;padding-bottom:4px;margin-bottom:8px}
    .tag{display:inline-block;border-radius:4px;padding:2px 7px;font-size:10px;margin:2px}
    .tw{background:#fff3cd;color:#856404}
    .td{background:#fde8e8;color:#7b1a1a}
    .note{font-size:11px;color:#444;background:#fafafa;border-left:3px solid #ccc;padding:6px 8px;border-radius:0 4px 4px 0;margin-top:6px}
    .glob{background:#f0f0f8;border:1px solid #d0d0e8;border-radius:6px;padding:11px 13px;margin-bottom:13px}
    .glob h3{font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px}
    .gr{display:flex;gap:8px}
    .gc{flex:1;text-align:center}
    .gc .n{font-size:17px;font-weight:700;color:#1a1a2e}
    .gc .l{font-size:9px;color:#888;margin-top:1px}
    .ftr{margin-top:20px;border-top:1px solid #ddd;padding-top:8px;font-size:9px;color:#aaa;display:flex;justify-content:space-between;align-items:center}
    .badge{background:#d4edda;color:#155724;padding:2px 8px;border-radius:3px;font-weight:700;font-size:9px}
    @media print{body{padding:10px}@page{margin:10mm}}
  </style></head><body>
  <div class="hdr">
    <div>
      <div class="sub">RAPPORTO CONTROLLO QUALITA — CALZATURIFICIO</div>
      <h1>${r.modello.toUpperCase()}</h1>
      <div class="sub" style="margin-top:3px">Controllore: <b>${r.controllore}</b> &middot; ${fmt(r.dataControllo)}</div>
    </div>
    <div class="rid">#${r.id}</div>
  </div>
  <div class="g4">
    <div class="card"><div class="n" style="color:#1a1a2e">${r.qtaControllata}</div><div class="l">Controllate</div></div>
    <div class="card"><div class="n" style="color:#27ae60">${ok}</div><div class="l">Conformi</div><div class="bar"><div style="background:#27ae60;width:${pOk}%"></div></div><div class="bpct" style="color:#27ae60">${pOk}%</div></div>
    <div class="card"><div class="n" style="color:#e67e22">${r.qtaRiparata}</div><div class="l">Riparate</div><div class="bar"><div style="background:#e67e22;width:${pRip}%"></div></div><div class="bpct" style="color:#e67e22">${pRip}%</div></div>
    <div class="card"><div class="n" style="color:#e74c3c">${r.qtaResa}</div><div class="l">Rese</div><div class="bar"><div style="background:#e74c3c;width:${pReso}%"></div></div><div class="bpct" style="color:#e74c3c">${pReso}%</div></div>
  </div>
  <div class="sec"><h3>Composizione lotto</h3>
    <div class="stk">
      <div style="background:#27ae60;width:${pOk}%">${pOk > 8 ? pOk + "%" : ""}</div>
      <div style="background:#e67e22;width:${pRip}%">${pRip > 5 ? pRip + "%" : ""}</div>
      <div style="background:#e74c3c;width:${pReso}%">${pReso > 5 ? pReso + "%" : ""}</div>
    </div>
    <div class="leg">
      <span style="color:#27ae60">Conformi ${pOk}% (${ok} paia)</span>
      <span style="color:#e67e22">Riparate ${pRip}% (${r.qtaRiparata} paia)</span>
      <span style="color:#e74c3c">Rese ${pReso}% (${r.qtaResa} paia)</span>
    </div>
  </div>
  ${r.qtaRiparata > 0 ? `<div class="sec"><h3>Difetti rilevati (${r.qtaRiparata} paia)</h3>
    <div>${(r.difettiRiparati || []).map(d => `<span class="tag tw">${d}</span>`).join("")}</div>
    ${r.noteDifetti ? `<div class="note">${r.noteDifetti}</div>` : ""}
  </div>` : ""}
  ${r.qtaResa > 0 ? `<div class="sec"><h3>Motivi reso (${r.qtaResa} paia)</h3>
    <div>${(r.motiviReso || []).map(d => `<span class="tag td">${d}</span>`).join("")}</div>
    ${r.noteReso ? `<div class="note">${r.noteReso}</div>` : ""}
  </div>` : ""}
  ${photos ? `<div class="sec"><h3>Foto difetti</h3><div style="display:flex;flex-wrap:wrap;gap:4px">${photos}</div></div>` : ""}
  ${all.length > 1 ? `<div class="glob">
    <h3>KPI cumulativi (${all.length} rapporti)</h3>
    <div class="gr">
      <div class="gc"><div class="n">${tC}</div><div class="l">Paia totali</div></div>
      <div class="gc"><div class="n" style="color:#27ae60">${tOk}</div><div class="l">Conformi</div>
        <div class="bar" style="max-width:60px;margin:3px auto 0"><div style="background:#27ae60;width:${avg}%"></div></div>
        <div class="bpct" style="color:#27ae60">${avg}% media</div>
      </div>
      <div class="gc"><div class="n" style="color:#e67e22">${tRip}</div><div class="l">Riparate</div></div>
      <div class="gc"><div class="n" style="color:#e74c3c">${tReso}</div><div class="l">Rese</div></div>
    </div>
  </div>` : ""}
  <div class="ftr">
    <span>Generato il ${new Date().toLocaleDateString("it-IT")} ore ${new Date().toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"})}</span>
    <span class="badge">DOCUMENTO UFFICIALE</span>
  </div>
  </body></html>`;
}

// ── componenti UI ─────────────────────────────────────────────────────────
function Sec({ title, children }) {
  return (
    <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>{title}</div>
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
  return <span style={{background:`var(--color-background-${color})`,color:`var(--color-text-${color})`,borderRadius:6,padding:"3px 8px",fontSize:12}}>{n} {label}</span>;
}
function TagBtn({ label, active, color, onClick }) {
  return (
    <button onClick={onClick} style={{padding:"5px 12px",borderRadius:6,border:"0.5px solid",cursor:"pointer",fontSize:12,fontWeight:400,
      background:active ? `var(--color-background-${color})` : "var(--color-background-secondary)",
      borderColor:active ? `var(--color-border-${color})` : "var(--color-border-tertiary)",
      color:active ? `var(--color-text-${color})` : "var(--color-text-secondary)"}}>
      {label}
    </button>
  );
}
function Toast({ t }) {
  return (
    <div style={{position:"fixed",top:16,right:16,zIndex:999,
      background:t.ok ? "var(--color-background-success)" : "var(--color-background-danger)",
      color:t.ok ? "var(--color-text-success)" : "var(--color-text-danger)",
      border:"0.5px solid",borderColor:t.ok ? "var(--color-border-success)" : "var(--color-border-danger)",
      borderRadius:10,padding:"10px 18px",fontSize:13,fontWeight:500,maxWidth:320}}>
      {t.msg}
    </div>
  );
}
function DifettiCard({ difetti, note, tipo, titolo }) {
  return (
    <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 18px",marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:500,color:`var(--color-text-${tipo})`,marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>{titolo}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:note ? 10 : 0}}>
        {(difetti || []).map(d => <span key={d} style={{background:`var(--color-background-${tipo})`,color:`var(--color-text-${tipo})`,borderRadius:6,padding:"4px 10px",fontSize:12}}>{d}</span>)}
        {!(difetti || []).length && <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>Nessuno specificato</span>}
      </div>
      {note && <div style={{fontSize:13,color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:8,padding:10}}>{note}</div>}
    </div>
  );
}

function PWAGuide({ onClose }) {
  const [tab, setTab] = useState("android");
  const steps = {
    android: [
      {n:"1",t:"Apri Chrome sul telefono Android",d:"Deve essere Chrome, non altri browser"},
      {n:"2",t:"Vai al link dell'app",d:"Quello che hai ricevuto"},
      {n:"3",t:"Tocca i tre puntini in alto a destra",d:"Nella barra di Chrome"},
      {n:"4",t:"Aggiungi a schermata Home",d:"Oppure: Installa app"},
      {n:"5",t:"Apri dalla Home",d:"Si apre a schermo intero come app vera"},
    ],
    ios: [
      {n:"1",t:"Apri Safari su iPhone/iPad",d:"Solo Safari, non Chrome"},
      {n:"2",t:"Vai al link dell'app",d:"Quello che hai ricevuto"},
      {n:"3",t:"Tocca l'icona Condividi in basso",d:"La freccia al centro della barra Safari"},
      {n:"4",t:"Aggiungi a schermata Home",d:"Scorri nel menu e cercalo"},
      {n:"5",t:"Apri dalla Home",d:"Si apre a schermo intero"},
    ]
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"var(--color-background-primary)",borderRadius:"20px 20px 0 0",padding:"24px 20px 36px",width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontSize:18,fontWeight:500}}>Installa sul telefono</div>
            <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:2}}>Aggiungi alla Home come app</div>
          </div>
          <button onClick={onClose} style={{background:"var(--color-background-secondary)",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16,color:"var(--color-text-secondary)"}}>x</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:20,background:"var(--color-background-secondary)",borderRadius:10,padding:4}}>
          {[["android","Android"],["ios","iPhone"]].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{flex:1,padding:"8px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,
              background:tab===k ? "var(--color-background-primary)" : "transparent",
              color:tab===k ? "var(--color-text-primary)" : "var(--color-text-secondary)"}}>
              {l}
            </button>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {steps[tab].map((s, i) => (
            <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:"#1a1a2e",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,flexShrink:0}}>{s.n}</div>
              <div style={{paddingTop:4}}>
                <div style={{fontWeight:500,fontSize:14}}>{s.t}</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:3}}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{width:"100%",marginTop:20,padding:"13px",borderRadius:10,border:"none",background:"#1a1a2e",color:"#fff",fontSize:15,fontWeight:500,cursor:"pointer"}}>Ho capito</button>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]          = useState("list");
  const [reports, setReports]    = useState([]);
  const [selected, setSelected]  = useState(null);
  const [saving, setSaving]      = useState(false);
  const [printing, setPrinting]  = useState(false);
  const [toast, setToast]        = useState(null);
  const [filterText, setFilter]  = useState("");
  const [showPWA, setShowPWA]    = useState(false);
  const [dbReady, setDbReady]    = useState(false);
  const [dbError, setDbError]    = useState(false);
  const dbRef = useRef(null);
  const fileRef = useRef();

  const blank = {
    controllore:"", modello:"", dataControllo:new Date().toISOString().slice(0,16),
    qtaControllata:"", qtaRiparata:"", qtaResa:"",
    difettiRiparati:[], noteDifetti:"", motiviReso:[], noteReso:[], fotoDifetti:[]
  };
  const [form, setForm] = useState(blank);

  useEffect(() => {
    try {
      const isConfigured = FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.includes("INCOLLA");
      if (!isConfigured) { setDbError("not_configured"); return; }
      const app = initializeApp(FIREBASE_CONFIG);
      const db  = getDatabase(app);
      dbRef.current = ref(db, "rapporti");
      setDbReady(true);
      onValue(dbRef.current, snap => {
        const data = snap.val();
        if (data) {
          const list = Object.entries(data).map(([fbKey, v]) => ({...v, fbKey}));
          list.sort((a, b) => b.id - a.id);
          setReports(list);
        } else {
          setReports([]);
        }
      }, err => { setDbError("connection_error"); });
    } catch(e) { setDbError("init_error"); }
  }, []);

  function showToast(msg, ok=true) { setToast({msg, ok}); setTimeout(() => setToast(null), 3500); }
  function tog(arr, v) { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }

  async function onPhoto(e) {
    const files = Array.from(e.target.files);
    const compressed = await Promise.all(files.map(f => compressImage(f)));
    setForm(f => ({...f, fotoDifetti: [...f.fotoDifetti, ...compressed]}));
    e.target.value = "";
  }

  async function submit() {
    if (!form.controllore.trim() || !form.modello.trim() || !form.qtaControllata) {
      showToast("Compila: controllore, modello e quantita", false); return;
    }
    const qC = parseInt(form.qtaControllata) || 0;
    const qR = parseInt(form.qtaRiparata) || 0;
    const qRe = parseInt(form.qtaResa) || 0;
    if (qR + qRe > qC) { showToast("Riparate + Rese superano le paia controllate", false); return; }
    setSaving(true);
    const rep = {...form, id:Date.now().toString().slice(-7), qtaControllata:qC, qtaRiparata:qR, qtaResa:qRe, ts:Date.now()};
    try {
      if (dbReady && dbRef.current) {
        await push(dbRef.current, rep);
        showToast("Rapporto #" + rep.id + " salvato e sincronizzato");
      } else {
        showToast("Firebase non configurato", false);
      }
    } catch(e) { showToast("Errore salvataggio: " + e.message, false); }
    setSaving(false);
    setForm(blank);
    setView("list");
  }

  async function delReport(r) {
    if (!confirm("Eliminare questo rapporto?")) return;
    try {
      if (dbReady && r.fbKey) {
        const app = initializeApp(FIREBASE_CONFIG);
        const db  = getDatabase(app);
        await remove(ref(db, "rapporti/" + r.fbKey));
      }
      showToast("Rapporto eliminato");
      setView("list");
    } catch(e) { showToast("Errore: " + e.message, false); }
  }

  async function doPrint(r) {
    setPrinting(true);
    try {
      printReport(buildPDF(r, reports));
      showToast("Dialogo di stampa aperto");
    } catch(e) { showToast("Errore stampa: " + e.message, false); }
    setPrinting(false);
  }

  const filtered = reports.filter(r =>
    r.modello?.toLowerCase().includes(filterText.toLowerCase()) ||
    r.controllore?.toLowerCase().includes(filterText.toLowerCase())
  );
  const totCtrl = reports.reduce((a,r) => a + r.qtaControllata, 0);
  const totOk   = reports.reduce((a,r) => a + r.qtaControllata - r.qtaRiparata - r.qtaResa, 0);
  const totReso = reports.reduce((a,r) => a + r.qtaResa, 0);
  const avgOk   = totCtrl > 0 ? Math.round(totOk / totCtrl * 100) : 0;

  // ── BANNER FIREBASE NON CONFIGURATO ──────────────────────────────────────
  if (dbError === "not_configured") {
    return (
      <div style={{maxWidth:560,margin:"40px auto",padding:"0 16px"}}>
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:16,padding:"32px 28px",textAlign:"center"}}>
          <div style={{fontSize:44,marginBottom:16}}>🔧</div>
          <h2 style={{fontSize:20,fontWeight:500,marginBottom:8}}>Configura Firebase</h2>
          <p style={{fontSize:14,color:"var(--color-text-secondary)",lineHeight:1.7,marginBottom:20}}>
            Inserisci le tue credenziali Firebase in cima al file App.jsx per attivare la sincronizzazione.
          </p>
        </div>
      </div>
    );
  }

  // ── DETAIL ────────────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    const r = selected;
    const ok   = r.qtaControllata - r.qtaRiparata - r.qtaResa;
    const pOk  = r.qtaControllata > 0 ? Math.round(ok / r.qtaControllata * 100) : 0;
    const pRip = r.qtaControllata > 0 ? Math.round(r.qtaRiparata / r.qtaControllata * 100) : 0;
    const pReso= r.qtaControllata > 0 ? Math.round(r.qtaResa / r.qtaControllata * 100) : 0;
    return (
      <div style={{maxWidth:680,margin:"0 auto",padding:"0 0 60px"}}>
        {toast && <Toast t={toast}/>}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>
          <button onClick={() => setView("list")} style={{background:"none",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13,color:"var(--color-text-secondary)"}}>Storico</button>
          <span style={{flex:1,fontWeight:500,fontSize:17}}>Rapporto #{r.id}</span>
          <button onClick={() => doPrint(r)} disabled={printing} style={{padding:"8px 18px",borderRadius:8,border:"none",background:printing ? "var(--color-border-secondary)" : "#1a1a2e",color:"#fff",fontSize:13,fontWeight:500,cursor:printing ? "not-allowed" : "pointer"}}>
            {printing ? "..." : "Stampa / PDF"}
          </button>
          <button onClick={() => delReport(r)} style={{background:"none",border:"0.5px solid var(--color-border-danger)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13,color:"var(--color-text-danger)"}}>Elimina</button>
        </div>
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"16px 20px",marginBottom:14}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["Controllore",r.controllore],["Modello",r.modello],["Data",fmt(r.dataControllo)],["ID","#"+r.id]].map(([l,v]) => (
              <div key={l}>
                <div style={{fontSize:11,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:1}}>{l}</div>
                <div style={{fontSize:15,fontWeight:500,marginTop:2}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
          {[
            [r.qtaControllata,"Controllate","var(--color-text-primary)",100],
            [ok,"OK "+pOk+"%","var(--color-text-success)",pOk],
            [r.qtaRiparata,"Rip. "+pRip+"%","var(--color-text-warning)",pRip],
            [r.qtaResa,"Rese "+pReso+"%","var(--color-text-danger)",pReso],
          ].map(([n,l,c,p], i) => (
            <div key={i} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:10,padding:"12px 8px",textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:500,color:c}}>{n}</div>
              <div style={{fontSize:10,color:"var(--color-text-secondary)",marginTop:3,lineHeight:1.3}}>{l}</div>
              <div style={{background:"var(--color-background-secondary)",borderRadius:3,height:4,marginTop:6}}>
                <div style={{background:c,width:p+"%",height:4,borderRadius:3}}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:8}}>COMPOSIZIONE LOTTO</div>
          <div style={{height:18,borderRadius:6,overflow:"hidden",display:"flex"}}>
            <div style={{background:"var(--color-background-success)",width:pOk+"%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-text-success)",fontSize:10,fontWeight:500,overflow:"hidden"}}>{pOk>8?pOk+"%":""}</div>
            <div style={{background:"var(--color-background-warning)",width:pRip+"%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-text-warning)",fontSize:10,fontWeight:500,overflow:"hidden"}}>{pRip>5?pRip+"%":""}</div>
            <div style={{background:"var(--color-background-danger)",width:pReso+"%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-text-danger)",fontSize:10,fontWeight:500,overflow:"hidden"}}>{pReso>5?pReso+"%":""}</div>
          </div>
          <div style={{display:"flex",gap:14,marginTop:6,fontSize:11}}>
            <span style={{color:"var(--color-text-success)"}}>OK {pOk}%</span>
            <span style={{color:"var(--color-text-warning)"}}>Riparati {pRip}%</span>
            <span style={{color:"var(--color-text-danger)"}}>Resi {pReso}%</span>
          </div>
        </div>
        {r.qtaRiparata > 0 && <DifettiCard difetti={r.difettiRiparati} note={r.noteDifetti} tipo="warning" titolo="Difetti riparati"/>}
        {r.qtaResa > 0 && <DifettiCard difetti={r.motiviReso} note={r.noteReso} tipo="danger" titolo="Motivi reso al terzista"/>}
        {(r.fotoDifetti || []).length > 0 && (
          <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 18px"}}>
            <div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Foto difetti ({r.fotoDifetti.length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
              {r.fotoDifetti.map((p, i) => (
                <div key={i} style={{textAlign:"center"}}>
                  <img src={p.data} alt={p.nome} style={{width:120,height:90,objectFit:"cover",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)"}}/>
                  <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:4,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.nome}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── FORM ──────────────────────────────────────────────────────────────────
  if (view === "form") {
    const qC  = parseInt(form.qtaControllata) || 0;
    const qR  = parseInt(form.qtaRiparata) || 0;
    const qRe = parseInt(form.qtaResa) || 0;
    return (
      <div style={{maxWidth:640,margin:"0 auto",padding:"0 0 80px"}}>
        {toast && <Toast t={toast}/>}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <button onClick={() => setView("list")} style={{background:"none",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13,color:"var(--color-text-secondary)"}}>Annulla</button>
          <h2 style={{margin:0,fontSize:18,fontWeight:500}}>Nuovo controllo qualita</h2>
        </div>
        <Sec title="Dati generali">
          <Fld label="Nome controllore *">
            <input value={form.controllore} onChange={e => setForm(f => ({...f, controllore:e.target.value}))} placeholder="Es. Mario Rossi"/>
          </Fld>
          <Fld label="Modello / Articolo *">
            <input value={form.modello} onChange={e => setForm(f => ({...f, modello:e.target.value}))} placeholder="Es. Derby 2024 cod. AB123"/>
          </Fld>
          <Fld label="Data e ora">
            <input type="datetime-local" value={form.dataControllo} onChange={e => setForm(f => ({...f, dataControllo:e.target.value}))}/>
          </Fld>
        </Sec>
        <Sec title="Quantita">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <Fld label="Controllate *">
              <input type="number" min="0" value={form.qtaControllata} onChange={e => setForm(f => ({...f, qtaControllata:e.target.value}))} placeholder="0"/>
            </Fld>
            <Fld label="Riparate">
              <input type="number" min="0" value={form.qtaRiparata} onChange={e => setForm(f => ({...f, qtaRiparata:e.target.value}))} placeholder="0"/>
            </Fld>
            <Fld label="Rese al terzista">
              <input type="number" min="0" value={form.qtaResa} onChange={e => setForm(f => ({...f, qtaResa:e.target.value}))} placeholder="0"/>
            </Fld>
          </div>
          {qC > 0 && (
            <div style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--color-text-secondary)"}}>
              Paia OK: <strong style={{color:"var(--color-text-success)"}}>{Math.max(0, qC-qR-qRe)}</strong>
              &nbsp;·&nbsp; Conformita: <strong style={{color:Math.max(0,qC-qR-qRe)/qC >= 0.9 ? "var(--color-text-success)" : "var(--color-text-warning)"}}>{Math.round(Math.max(0,qC-qR-qRe)/qC*100)}%</strong>
            </div>
          )}
        </Sec>
        {qR > 0 && (
          <Sec title={"Difetti riparati " + qR + " paia"}>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
              {DIFETTI_COMUNI.map(d => <TagBtn key={d} label={d} active={form.difettiRiparati.includes(d)} color="warning" onClick={() => setForm(f => ({...f, difettiRiparati:tog(f.difettiRiparati,d)}))}/>)}
            </div>
            <Fld label="Note difetti">
              <textarea value={form.noteDifetti} onChange={e => setForm(f => ({...f, noteDifetti:e.target.value}))} placeholder="Descrizione aggiuntiva..." rows={2} style={{resize:"vertical"}}/>
            </Fld>
          </Sec>
        )}
        {qRe > 0 && (
          <Sec title={"Motivi reso " + qRe + " paia"}>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
              {PROBLEMI_RESO.map(d => <TagBtn key={d} label={d} active={form.motiviReso.includes(d)} color="danger" onClick={() => setForm(f => ({...f, motiviReso:tog(f.motiviReso,d)}))}/>)}
            </div>
            <Fld label="Note reso">
              <textarea value={form.noteReso} onChange={e => setForm(f => ({...f, noteReso:e.target.value}))} placeholder="Motivazioni dettagliate..." rows={2} style={{resize:"vertical"}}/>
            </Fld>
          </Sec>
        )}
        <Sec title="Foto difetti">
          <button onClick={() => fileRef.current?.click()} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 16px",borderRadius:8,border:"0.5px dashed var(--color-border-secondary)",background:"var(--color-background-secondary)",cursor:"pointer",fontSize:13,color:"var(--color-text-secondary)",width:"100%",justifyContent:"center"}}>
            Aggiungi foto difetti
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPhoto} style={{display:"none"}}/>
          {form.fotoDifetti.length > 0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
              {form.fotoDifetti.map((p, i) => (
                <div key={i} style={{position:"relative"}}>
                  <img src={p.data} alt={p.nome} style={{width:90,height:68,objectFit:"cover",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)"}}/>
                  <button onClick={() => setForm(f => ({...f, fotoDifetti:f.fotoDifetti.filter((_,j) => j !== i)}))} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.65)",color:"#fff",border:"none",borderRadius:"50%",width:18,height:18,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>x</button>
                </div>
              ))}
            </div>
          )}
        </Sec>
        <button onClick={submit} disabled={saving} style={{width:"100%",padding:"14px",borderRadius:10,border:"none",background:saving ? "var(--color-border-secondary)" : "#1a1a2e",color:"#fff",fontSize:15,fontWeight:500,cursor:saving ? "not-allowed" : "pointer"}}>
          {saving ? "Salvataggio..." : "Salva rapporto"}
        </button>
      </div>
    );
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  return (
    <div style={{maxWidth:700,margin:"0 auto",padding:"0 0 40px"}}>
      {toast && <Toast t={toast}/>}
      {showPWA && <PWAGuide onClose={() => setShowPWA(false)}/>}

      {dbReady && (
        <div style={{background:"var(--color-background-success)",border:"0.5px solid var(--color-border-success)",borderRadius:10,padding:"8px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8,fontSize:13,color:"var(--color-text-success)"}}>
          <span>●</span> <strong>Sincronizzato</strong> — storico condiviso su tutti i telefoni
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:500,letterSpacing:"-.5px"}}>Controllo Qualita</h1>
          <p style={{margin:"2px 0 0",fontSize:13,color:"var(--color-text-secondary)"}}>Gestione ispezioni prodotto finito</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={() => setShowPWA(true)} style={{padding:"9px 12px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",fontSize:13,cursor:"pointer",color:"var(--color-text-secondary)"}}>Install</button>
          <button onClick={() => setView("form")} style={{padding:"9px 18px",borderRadius:8,border:"none",background:"#1a1a2e",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>+ Nuovo</button>
        </div>
      </div>

      {reports.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
          {[[reports.length,"Rapporti","var(--color-text-primary)"],[totCtrl,"Paia totali","var(--color-text-primary)"],[avgOk+"%","Conformita media","var(--color-text-success)"],[totReso,"Paia rese","var(--color-text-danger)"]].map(([v,l,c]) => (
            <div key={l} style={{background:"var(--color-background-secondary)",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:22,fontWeight:500,color:c}}>{v}</div>
              <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {reports.length > 0 && (
        <div style={{marginBottom:12}}>
          <input value={filterText} onChange={e => setFilter(e.target.value)} placeholder="Cerca per modello o controllore..." style={{width:"100%",boxSizing:"border-box"}}/>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{textAlign:"center",padding:"60px 20px",color:"var(--color-text-secondary)"}}>
          <div style={{fontSize:44,marginBottom:14}}>👟</div>
          <div style={{fontSize:15,fontWeight:500}}>Nessun rapporto ancora</div>
          <div style={{fontSize:13,marginTop:6}}>Tocca Nuovo per iniziare</div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map(r => {
          const ok  = r.qtaControllata - r.qtaRiparata - r.qtaResa;
          const pct = r.qtaControllata > 0 ? Math.round(ok / r.qtaControllata * 100) : 0;
          const c   = pct >= 90 ? "var(--color-text-success)" : pct >= 70 ? "var(--color-text-warning)" : "var(--color-text-danger)";
          const bg  = pct >= 90 ? "var(--color-background-success)" : pct >= 70 ? "var(--color-background-warning)" : "var(--color-background-danger)";
          return (
            <div key={r.id || r.fbKey} onClick={() => {setSelected(r); setView("detail");}}
              style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border-secondary)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-tertiary)"}>
              <div style={{width:50,height:50,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:14,fontWeight:500,color:c}}>{pct}%</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:500,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.modello}</div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{r.controllore} · {fmt(r.dataControllo)}</div>
              </div>
              <div style={{display:"flex",gap:7,flexShrink:0,alignItems:"center"}}>
                <Pill n={r.qtaControllata} label="tot" color="secondary"/>
                {r.qtaRiparata > 0 && <Pill n={r.qtaRiparata} label="rip" color="warning"/>}
                {r.qtaResa > 0 && <Pill n={r.qtaResa} label="reso" color="danger"/>}
                {r.fotoDifetti?.length > 0 && <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{r.fotoDifetti.length} foto</span>}
              </div>
              <span style={{color:"var(--color-text-secondary)",fontSize:18}}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
