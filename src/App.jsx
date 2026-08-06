import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import { t, tv, tTab, setLang, LANGS, locale } from "./i18n";
import { PARAMS } from "./params";
import { ACQUISTI_ATTIVI, isPremium, maxAllegati, MAX_GRATIS, MAX_PREMIUM, acquistiDisponibili, prezzo, acquista, ripristina } from "./acquisti";

const APP_VERSION = "1.0.4";

const SPEC = ["Medicina generale","Cardiologia","Dermatologia","Endocrinologia","Gastroenterologia","Ginecologia","Neurologia","Oftalmologia","Ortopedia","Otorinolaringoiatria","Pneumologia","Reumatologia","Urologia","Altro"];
const VITALI = [
  {n:"Peso",u:"kg",c:"#3b82f6"},{n:"Pressione",u:"mmHg",c:"#ef4444"},
  {n:"Glicemia",u:"mg/dL",c:"#f59e0b"},
  {n:"Frequenza cardiaca",u:"bpm",c:"#ec4899"},
  {n:"Temperatura",u:"°C",c:"#a855f7"},{n:"Saturazione O₂",u:"%",c:"#06b6d4"},
];

// Migra i vecchi record separati sistolica/diastolica nel tipo unico "Pressione"
const migraPressione = list => {
  const out=[], byDate={};
  let changed=false;
  for (const v of list) {
    if (v.tipo==='Pressione sistolica'||v.tipo==='Pressione diastolica') {
      changed=true;
      const k=v.data;
      byDate[k]=byDate[k]||{id:v.id,data:v.data,tipo:'Pressione',massima:null,minima:null};
      const n=parseFloat(v.valore);
      if (v.tipo==='Pressione sistolica') byDate[k].massima=n; else byDate[k].minima=n;
    } else out.push(v);
  }
  const merged=[...out,...Object.values(byDate)].sort((a,b)=>b.data.localeCompare(a.data));
  return {list:merged, changed};
};
const SPORT = [
  {n:"Palestra",i:"🏋️"},{n:"Corsa",i:"🏃"},{n:"Camminata",i:"🚶"},{n:"Bici",i:"🚴"},
  {n:"Nuoto",i:"🏊"},{n:"Calcio",i:"⚽"},{n:"Tennis / Padel",i:"🎾"},{n:"Yoga / Stretching",i:"🧘"},{n:"Altro",i:"💪"},
];
const sportIcon = t => SPORT.find(s=>s.n===t)?.i || "💪";
const FREQ = ["1 volta al giorno","2 volte al giorno","3 volte al giorno","Ogni 8 ore","Ogni 12 ore","A giorni alterni","1 volta a settimana","Al bisogno"];
const TIPI_ESAME = ["Radiografia","Ecografia","TAC","Risonanza magnetica","Elettrocardiogramma","Esame urine","Tampone","Visita specialistica strumentale","Mammografia","Densitometria","Endoscopia","Altro"];
const esameIcon = t => ({Radiografia:'🩻',Ecografia:'🔊',TAC:'🌀',"Risonanza magnetica":'🧲',Elettrocardiogramma:'💓',"Esame urine":'🧪',Tampone:'🦠',Mammografia:'🎗️',Densitometria:'🦴',Endoscopia:'🔬'}[t] || '📑');
const GRUPPI = ["0-","0+","A-","A+","B-","B+","AB-","AB+"];
const TIPI_ALLERGIA = ["Farmaco","Alimento","Polline","Acaro","Pelo di animale","Puntura di insetto","Lattice","Metallo","Altro"];
const GRAVITA = ["Lieve","Moderata","Grave"];
const allergiaIcon = t => ({Farmaco:'💊',Alimento:'🍽️',Polline:'🌾',Acaro:'🛏️',"Pelo di animale":'🐕',"Puntura di insetto":'🐝',Lattice:'🧤',Metallo:'⚙️'}[t] || '⚠️');
const coloreGravita = g => g==='Grave' ? '#dc2626' : g==='Moderata' ? '#f59e0b' : '#65a30d';

const fmt = d => { if(!d) return '-'; const p=d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
const isAbn = p => p.min!==undefined&&(p.v<p.min||(p.max!==null&&p.max!==undefined&&p.v>p.max));
const refRange = p => {
  if(p.min===undefined) return null;
  if(p.max===null||p.max===undefined) return `> ${p.min}`;
  if(p.min===0) return `< ${p.max}`;
  return `${p.min} – ${p.max}`;
};
const readFile = f => new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
const mkCSV = (headers,rows) => { const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;return[headers,...rows].map(r=>r.map(esc).join(',')).join('\r\n'); };
// Su iPhone il download dei file non esiste: si usa il pannello di condivisione di iOS.
// Il BOM iniziale serve a far leggere correttamente gli accenti a Excel.
const csvBlob = content => new Blob(['\uFEFF'+content], {type:'text/csv;charset=utf-8'});
const scaricaBlob = (blob,name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
};
const salvaCSV = async (name,content) => {
  const blob = csvBlob(content);
  try {
    const f = new File([blob], name, {type:'text/csv'});
    if (navigator.canShare?.({files:[f]})) { await navigator.share({files:[f], title:name}); return true; }
  } catch(e) { if (e?.name==='AbortError') return true; }
  scaricaBlob(blob,name);
  return true;
};
const salvaCSVMulti = async elenco => {
  try {
    const fs = elenco.map(x=>new File([csvBlob(x.content)], x.name, {type:'text/csv'}));
    if (navigator.canShare?.({files:fs})) { await navigator.share({files:fs}); return; }
  } catch(e) { if (e?.name==='AbortError') return; }
  for (const x of elenco) { scaricaBlob(csvBlob(x.content), x.name); await new Promise(r=>setTimeout(r,400)); }
};
const fmtSize = b => b>1024*1024?`${(b/1024/1024).toFixed(1)} MB`:`${Math.round(b/1024)} KB`;
const eur = n => (n==null||n==='') ? '' : new Intl.NumberFormat(locale(),{style:'currency',currency:'EUR'}).format(n);
const fileIcon = t => t.startsWith('image/')?'🖼️':t==='application/pdf'?'📄':'📎';

// Base UI
const Inp = ({lbl,...p}) => (
  <div className="mb-3">
    {lbl&&<label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lbl}</label>}
    <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all" {...p}/>
  </div>
);
const Sel = ({lbl,opts,...p}) => (
  <div className="mb-3">
    {lbl&&<label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lbl}</label>}
    <select className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all" {...p}>
      {opts.map(o=><option key={o} value={o}>{tv(o)}</option>)}
    </select>
  </div>
);
// Menù a tendina con "Altro": scegliendolo compare un campo per scrivere di cosa si tratta.
// Il testo scritto viene salvato al posto di "Altro", così si legge ovunque.
const SelAltro = ({lbl, opts, value, onChange, placeholder}) => {
  const standard = opts.includes(value);
  const scelta = standard ? value : 'Altro';
  const libero = standard ? '' : (value || '');
  return (
    <div className="mb-3">
      {lbl&&<label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lbl}</label>}
      <select value={scelta} onChange={e=>onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all">
        {opts.map(o=><option key={o} value={o}>{tv(o)}</option>)}
      </select>
      {scelta==='Altro'&&(
        <input autoFocus={!libero} value={libero} placeholder={placeholder}
          onChange={e=>onChange(e.target.value || 'Altro')}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 mt-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all"/>
      )}
    </div>
  );
};
const Txt = ({lbl,...p}) => (
  <div className="mb-3">
    {lbl&&<label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lbl}</label>}
    <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all resize-none" rows={3} {...p}/>
  </div>
);
function Modal({title,onClose,onSave,saveLabel="Salva",saveBg="linear-gradient(135deg,#1e40af,#3b82f6)",children}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{background:'rgba(0,0,0,0.55)'}}>
      <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" style={{maxHeight:'92vh',display:'flex',flexDirection:'column',paddingBottom:'env(safe-area-inset-bottom)'}}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 font-bold text-lg">×</button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
        {onSave&&<div className="px-5 pb-6 pt-3 border-t border-gray-50">
          <button onClick={onSave} className="w-full py-3 rounded-2xl font-bold text-white text-sm shadow-lg hover:opacity-90 transition-opacity" style={{background:saveBg}}>{saveLabel}</button>
        </div>}
      </div>
    </div>
  );
}

// --- Attachment Components ---
function AttachmentPicker({files, onChange}) {
  const ref = useRef(null);
  const [paywall, setPaywall] = useState(false);
  const [, refresh] = useState(0);
  const MAX = maxAllegati();
  const onPremium = () => setPaywall(true);
  const handleChange = async e => {
    const picked = Array.from(e.target.files).slice(0, MAX-files.length);
    const added = [];
    for (const f of picked) {
      if (f.size > 4*1024*1024) { alert(t('too_big',f.name)); continue; }
      try { const data=await readFile(f); added.push({id:`att-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:f.name,type:f.type,size:f.size,data}); }
      catch(e) { alert(t('read_err',f.name)); }
    }
    if (added.length) onChange([...files,...added].slice(0,MAX));
    e.target.value='';
  };
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('att_count',files.length,MAX)}</label>
        {files.length<MAX
          ? <button type="button" onClick={()=>ref.current?.click()} className="text-xs text-blue-500 font-bold hover:text-blue-700">{t('add_file')}</button>
          : !isPremium()&&<button type="button" onClick={onPremium} className="text-xs font-bold" style={{color:'#b45309'}}>✨ {t('unlock_more')}</button>}
      </div>
      {paywall&&<PremiumModal onSbloccato={()=>refresh(n=>n+1)} onClose={()=>setPaywall(false)}/>}
      {files.length>=MAX&&!isPremium()&&(
        <button type="button" onClick={onPremium} className="w-full rounded-xl p-3 mb-2 text-left" style={{background:'#fffbeb',border:'1px solid #fde68a'}}>
          <p className="text-xs font-bold" style={{color:'#b45309'}}>✨ {t('limit_reached',MAX)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t('limit_hint',MAX_PREMIUM)}</p>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleChange}/>
      {files.length>0 ? (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {files.map(f=>(
            <div key={f.id} className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2.5">
              <span className="text-lg leading-none">{fileIcon(f.type)}</span>
              <span className="text-xs text-blue-700 font-medium flex-1 truncate">{f.name}</span>
              <span className="text-xs text-blue-300 flex-shrink-0">{fmtSize(f.size)}</span>
              <button type="button" onClick={()=>onChange(files.filter(x=>x.id!==f.id))} className="text-gray-300 hover:text-red-400 font-bold text-base ml-1 flex-shrink-0">×</button>
            </div>
          ))}
        </div>
      ) : (
        <div onClick={()=>ref.current?.click()} className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
          <p className="text-gray-300 text-2xl mb-1">📎</p>
          <p className="text-xs text-gray-400">{t('tap_add')}</p>
          <p className="text-xs text-gray-300 mt-0.5">{t('file_hint')}</p>
        </div>
      )}
    </div>
  );
}

// Converte un data URL (base64) nei byte del file
const dataUrlToBytes = url => {
  const bin = atob(String(url).split(',')[1] || '');
  const arr = new Uint8Array(bin.length);
  for (let i=0; i<bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

// Legge il PDF e ne disegna le pagine dentro l'app, una alla volta
function PdfViewer({file, onApri}) {
  const [pagine, setPagine] = useState([]);
  const [tot, setTot] = useState(0);
  const [stato, setStato] = useState('load');
  useEffect(()=>{
    let vivo = true;
    (async()=>{
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({data:dataUrlToBytes(file.data)}).promise;
        if (!vivo) return;
        const n = Math.min(doc.numPages, 40);
        setTot(doc.numPages);
        for (let i=1; i<=n; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({scale:2.2});   // risoluzione utile anche ingrandendo
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({canvasContext:canvas.getContext('2d'), viewport}).promise;
          if (!vivo) return;
          const img = canvas.toDataURL('image/jpeg', 0.85);
          setPagine(prev=>[...prev, img]);
          if (i===1) setStato('ok');
        }
        if (vivo) setStato('ok');
      } catch(e) { console.error(e); if (vivo) setStato('err'); }
    })();
    return ()=>{ vivo=false; };
  },[file]);

  if (stato==='err') return (
    <div className="text-center py-10">
      <p className="text-5xl mb-3">📄</p>
      <p className="text-sm text-gray-500">{t('pdf_error')}</p>
    </div>
  );
  return (
    <div>
      {stato==='load'&&<div className="text-center py-10"><p className="text-4xl mb-2">⏳</p><p className="text-sm text-gray-400">{t('pdf_loading')}</p></div>}
      <div className="space-y-3">
        {pagine.map((p,i)=>(
          <div key={i}>
            <button onClick={()=>onApri?.(pagine, i)} className="w-full block">
              <img src={p} alt={`${i+1}`} className="w-full rounded-xl shadow-sm border border-gray-100"/>
            </button>
            <p className="text-xs text-gray-300 text-center mt-1">{i+1} / {tot}</p>
          </div>
        ))}
      </div>
      {pagine.length>0&&<p className="text-xs text-gray-300 text-center mt-2">{t('tap_fullscreen')}</p>}
      {tot>40&&<p className="text-xs text-gray-400 text-center mt-3">{t('pdf_limit')}</p>}
    </div>
  );
}

// Immagine con zoom a pizzico, trascinamento e doppio tocco.
// L'app disabilita lo zoom del browser, quindi i gesti sono gestiti qui.
function Zoomabile({src, alt, onScalaCambio}) {
  const [s, setS] = useState(1);
  const [p, setP] = useState({x:0, y:0});
  const g = useRef({});
  const box = useRef(null);

  const dist = ts => Math.hypot(ts[0].clientX-ts[1].clientX, ts[0].clientY-ts[1].clientY);
  const limita = (np, ns) => {
    const el = box.current; if (!el) return np;
    const maxX = el.clientWidth * (ns-1) / 2, maxY = el.clientHeight * (ns-1) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, np.x)), y: Math.max(-maxY, Math.min(maxY, np.y)) };
  };
  const applica = (ns, np) => {
    ns = Math.min(6, Math.max(1, ns));
    const pos = ns===1 ? {x:0,y:0} : limita(np ?? p, ns);
    setS(ns); setP(pos); onScalaCambio?.(ns);
  };

  const start = e => {
    if (e.touches.length===2) g.current = {tipo:'pinch', d0:dist(e.touches), s0:s};
    else if (e.touches.length===1) {
      const ora = Date.now();
      if (ora - (g.current.ultimoTap||0) < 300) { applica(s>1 ? 1 : 2.5, {x:0,y:0}); g.current={}; return; }
      g.current = {tipo: s>1?'pan':null, x0:e.touches[0].clientX-p.x, y0:e.touches[0].clientY-p.y, ultimoTap:ora};
    }
  };
  const move = e => {
    const c = g.current;
    if (c.tipo==='pinch' && e.touches.length===2) applica(c.s0 * dist(e.touches)/c.d0);
    else if (c.tipo==='pan' && e.touches.length===1) applica(s, {x:e.touches[0].clientX-c.x0, y:e.touches[0].clientY-c.y0});
  };
  const fine = () => { g.current = {...g.current, tipo:null}; };

  return (
    <div ref={box} className="w-full h-full overflow-hidden flex items-center justify-center"
      style={{touchAction:'none'}}
      onTouchStart={start} onTouchMove={move} onTouchEnd={fine}
      onDoubleClick={()=>applica(s>1?1:2.5,{x:0,y:0})}>
      <img src={src} alt={alt} draggable={false}
        className="max-w-full max-h-full select-none"
        style={{transform:`translate(${p.x}px, ${p.y}px) scale(${s})`, transition: g.current.tipo?'none':'transform .18s'}}/>
    </div>
  );
}

// Apertura "come una foto": schermo intero, sfondo scuro, con zoom e sfoglio delle pagine
function VistaFoto({pagine, indice=0, titolo, onCondividi, onClose}) {
  const [i, setI] = useState(indice);
  const [scala, setScala] = useState(1);
  const n = pagine.length;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col" style={{background:'#0b0b0d'}}>
      <div className="flex items-center gap-2 px-4 pb-3 flex-shrink-0" style={{paddingTop:'calc(env(safe-area-inset-top) + 0.75rem)'}}>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg" style={{background:'rgba(255,255,255,0.12)'}}>×</button>
        <p className="text-white text-sm font-bold flex-1 truncate">{titolo}</p>
        {onCondividi&&<button onClick={onCondividi} className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{background:'rgba(255,255,255,0.12)'}}>📤</button>}
      </div>

      <div className="flex-1 min-h-0 px-2">
        <Zoomabile key={i} src={pagine[i]} alt={`${i+1}`} onScalaCambio={setScala}/>
      </div>

      <div className="flex items-center justify-center gap-4 px-4 flex-shrink-0" style={{paddingBottom:'calc(env(safe-area-inset-bottom) + 0.75rem)', paddingTop:'0.75rem'}}>
        {n>1&&(
          <>
            <button onClick={()=>setI(x=>Math.max(0,x-1))} disabled={i===0}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xl disabled:opacity-25" style={{background:'rgba(255,255,255,0.12)'}}>‹</button>
            <p className="text-white text-sm font-bold tabular-nums">{i+1} / {n}</p>
            <button onClick={()=>setI(x=>Math.min(n-1,x+1))} disabled={i===n-1}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xl disabled:opacity-25" style={{background:'rgba(255,255,255,0.12)'}}>›</button>
          </>
        )}
        {n===1&&<p className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>{scala>1?t('zoom_hint_out'):t('zoom_hint_in')}</p>}
      </div>
    </div>
  );
}

function AttachmentViewer({file, onClose}) {
  const isImg = file.type.startsWith('image/');
  const isPdf = file.type==='application/pdf';
  const [foto, setFoto] = useState(null);   // {pagine, indice}

  const apriFuori = async () => {
    // Prova la condivisione nativa (su iPhone apre "Salva su File", Mail, WhatsApp...)
    try {
      const blob = await (await fetch(file.data)).blob();
      const f = new File([blob], file.name, {type:file.type||'application/octet-stream'});
      if (navigator.canShare?.({files:[f]})) { await navigator.share({files:[f], title:file.name}); return; }
    } catch(e){ /* condivisione non disponibile */ }
    const a = document.createElement('a');
    a.href = file.data; a.download = file.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{background:'rgba(0,0,0,0.7)'}}>
      <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" style={{height:'92vh',display:'flex',flexDirection:'column',paddingBottom:'env(safe-area-inset-bottom)'}}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{fileIcon(file.type)}</span>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 text-sm truncate">{file.name}</h3>
              <p className="text-xs text-gray-300">{fmtSize(file.size)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 font-bold text-lg flex-shrink-0 ml-2">×</button>
        </div>

        <div className="overflow-auto p-4 flex-1" style={{background:isImg||isPdf?'#f8faff':'white'}}>
          {isImg && (
            <>
              <button onClick={()=>setFoto({pagine:[file.data], indice:0})} className="w-full">
                <img src={file.data} alt={file.name} className="w-full rounded-xl shadow-sm"/>
              </button>
              <p className="text-xs text-gray-300 text-center mt-2">{t('tap_fullscreen')}</p>
            </>
          )}
          {isPdf && <PdfViewer file={file} onApri={(pagine,i)=>setFoto({pagine, indice:i})}/>}
          {!isImg&&!isPdf&&(
            <div className="text-center py-12">
              <p className="text-6xl mb-3">{fileIcon(file.type)}</p>
              <p className="font-semibold text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{t('preview_none')}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-6 pt-3 border-t border-gray-50">
          <button onClick={apriFuori} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-bold text-white text-sm" style={{background:'linear-gradient(135deg,#1e40af,#3b82f6)'}}>
            📤 {t('share_save')}
          </button>
        </div>
      </div>

      {foto&&<VistaFoto pagine={foto.pagine} indice={foto.indice} titolo={file.name}
        onCondividi={apriFuori} onClose={()=>setFoto(null)}/>}
    </div>
  );
}

function InlineAttachments({allegati=[], recordId}) {
  const [viewer, setViewer] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  if (!allegati?.length) return null;
  const open = async att => {
    setLoadingId(att.id);
    try {
      const r = await window.storage.get(`ht-att-${recordId}`);
      const all = JSON.parse(r.value);
      const full = all.find(a=>a.id===att.id);
      if (full) setViewer(full); else alert(t('att_missing'));
    } catch(e) { alert(t('att_load_err')); }
    setLoadingId(null);
  };
  return (
    <>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('att_n',allegati.length)}</p>
        <div className="space-y-1.5">
          {allegati.map(att=>(
            <button key={att.id} onClick={()=>open(att)} disabled={!!loadingId}
              className="w-full flex items-center gap-2.5 bg-blue-50 hover:bg-blue-100 rounded-xl px-3 py-2.5 transition-colors">
              <span className="text-lg leading-none flex-shrink-0">{fileIcon(att.type)}</span>
              <span className="text-xs text-blue-700 font-medium flex-1 text-left truncate">{att.name}</span>
              <span className="text-xs text-blue-300 flex-shrink-0">{fmtSize(att.size)}</span>
              <span className="text-xs text-blue-300 flex-shrink-0">{loadingId===att.id?'⏳':'→'}</span>
            </button>
          ))}
        </div>
      </div>
      {viewer&&<AttachmentViewer file={viewer} onClose={()=>setViewer(null)}/>}
    </>
  );
}

// --- Modals ---
// In modifica recupera gli allegati completi, così si possono togliere o aggiungere
function useAllegatiCompleti(iniziale, sf) {
  const [caricando, setCaricando] = useState(!!iniziale?.allegati?.length);
  useEffect(()=>{
    if (!iniziale?.allegati?.length) return;
    (async()=>{
      try {
        const r = await window.storage.get(`ht-att-${iniziale.id}`);
        if (r?.value) sf(p=>({...p, allegati: JSON.parse(r.value)}));
      } catch(e){}
      setCaricando(false);
    })();
  },[iniziale]);
  return caricando;
}

const BtnModifica = ({onClick}) => (
  <button onClick={e=>{e.stopPropagation();onClick();}} title={t('edit')}
    className="w-9 h-9 rounded-xl flex items-center justify-center text-base bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all">✏️</button>
);

function VisitaModal({iniziale, onSave, onClose}) {
  const [f, sf] = useState(iniziale
    ? {...iniziale, diagnosi:iniziale.diagnosi||'', note:iniziale.note||'', costo:iniziale.costo??'', allegati:[]}
    : {data:'',medico:'',spec:'Medicina generale',diagnosi:'',costo:'',note:'',allegati:[]});
  const caricando = useAllegatiCompleti(iniziale, sf);
  const s = (k,v) => sf(p=>({...p,[k]:v}));
  const ok = f.data && f.medico.trim();
  const salva = () => {
    const c = parseFloat(String(f.costo).replace(',','.'));
    onSave({...f, costo: (f.costo!=='' && !isNaN(c)) ? c : null});
  };
  return (
    <Modal title={iniziale?t('edit_visit'):t('new_visit')} onClose={onClose} onSave={ok?salva:null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_visit')):t('need_visit')}>
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>s('data',e.target.value)}/>
      <Inp lbl={t('doctor_l')} placeholder={t('doctor_ph')} value={f.medico} onChange={e=>s('medico',e.target.value)}/>
      <SelAltro lbl={t('spec_l')} opts={SPEC} value={f.spec} onChange={v=>s('spec',v)} placeholder={t('spec_altro_ph')}/>
      <Inp lbl={t('diag_l')} placeholder={t('diag_ph')} value={f.diagnosi} onChange={e=>s('diagnosi',e.target.value)}/>
      <Inp lbl={t('cost_l')} type="text" inputMode="decimal" placeholder={t('cost_ph')} value={f.costo} onChange={e=>s('costo',e.target.value)}/>
      <Txt lbl={t('notes_l')} placeholder={t('visit_notes_ph')} value={f.note} onChange={e=>s('note',e.target.value)}/>
      {caricando
        ? <p className="text-xs text-gray-300 py-2">⏳ {t('loading')}</p>
        : <AttachmentPicker files={f.allegati} onChange={v=>s('allegati',v)}/>}
    </Modal>
  );
}

function ScansionaReferto({onFound}) {
  const ref = useRef(null);
  const [stato, setStato] = useState('idle'); // idle | work | done | error
  const [prog, setProg] = useState(0);
  const [trovati, setTrovati] = useState([]);
  const [scelti, setScelti] = useState({});

  const handle = async e => {
    const file = e.target.files?.[0];
    e.target.value='';
    if (!file) return;
    setStato('work'); setProg(0); setTrovati([]);
    try {
      const { leggiReferto } = await import('./ocr');
      const { params } = await leggiReferto(file, p=>setProg(Math.min(0.99,p)));
      setTrovati(params);
      setScelti(Object.fromEntries(params.map(p=>[p.n,true])));
      setStato(params.length ? 'done' : 'error');
    } catch (err) {
      console.error(err);
      setStato('error');
    }
  };

  const conferma = () => {
    onFound(trovati.filter(p=>scelti[p.n]));
    setStato('idle'); setTrovati([]);
  };

  return (
    <div className="mb-4">
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={handle}/>
      {stato==='idle'&&(
        <button type="button" onClick={()=>ref.current?.click()}
          className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 border-2 border-dashed transition-colors hover:bg-rose-50"
          style={{borderColor:'#fecdd3',background:'#fff7f7'}}>
          <span className="text-2xl">🔍</span>
          <span className="text-left flex-1">
            <span className="block text-sm font-bold" style={{color:'#be123c'}}>{t('scan_title')}</span>
            <span className="block text-xs text-gray-400">{t('scan_sub')}</span>
          </span>
        </button>
      )}
      {stato==='work'&&(
        <div className="rounded-2xl p-4 text-center" style={{background:'#fff7f7'}}>
          <p className="text-2xl mb-2">⏳</p>
          <p className="text-sm font-bold text-gray-600">{t('scan_working')}</p>
          <div className="h-1.5 bg-white rounded-full mt-3 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{width:`${Math.round(prog*100)}%`,background:'#f43f5e'}}/>
          </div>
          <p className="text-xs text-gray-400 mt-2">{t('scan_wait')}</p>
        </div>
      )}
      {stato==='done'&&(
        <div className="rounded-2xl p-4" style={{background:'#fff7f7'}}>
          <p className="text-sm font-bold mb-1" style={{color:'#be123c'}}>{t('scan_found',trovati.length)}</p>
          <p className="text-xs text-gray-400 mb-3">{t('scan_check')}</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto mb-3">
            {trovati.map(p=>(
              <label key={p.n} className="flex items-center gap-2.5 bg-white rounded-xl px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={!!scelti[p.n]} onChange={()=>setScelti(s=>({...s,[p.n]:!s[p.n]}))} className="w-4 h-4 accent-rose-500"/>
                <span className="text-xs text-gray-700 flex-1">{tv(p.n)}</span>
                <span className={`font-bold text-sm ${isAbn(p)?'text-red-600':'text-gray-700'}`}>{p.v}</span>
                <span className="text-xs text-gray-400">{p.u}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={()=>setStato('idle')} className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-white text-gray-500">{t('cancel')}</button>
            <button type="button" onClick={conferma} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{background:'#f43f5e'}}>{t('scan_add')}</button>
          </div>
        </div>
      )}
      {stato==='error'&&(
        <div className="rounded-2xl p-4 text-center" style={{background:'#fff7f7'}}>
          <p className="text-2xl mb-1">😕</p>
          <p className="text-sm font-bold text-gray-600">{t('scan_none')}</p>
          <p className="text-xs text-gray-400 mt-1 mb-3">{t('scan_none_sub')}</p>
          <button type="button" onClick={()=>setStato('idle')} className="w-full py-2.5 rounded-xl text-xs font-bold bg-white text-gray-500">{t('scan_retry')}</button>
        </div>
      )}
    </div>
  );
}

function NuovoParametroModal({onSave, onClose}) {
  const [f, sf] = useState({n:'', u:'', min:'', max:''});
  const ok = f.n.trim();
  const num = v => { const x=parseFloat(String(v).replace(',','.')); return isNaN(x)?null:x; };
  const salva = () => {
    const mn = num(f.min), mx = num(f.max);
    onSave({
      n: f.n.trim(), u: f.u.trim(),
      // solo massimo -> minimo 0 · solo minimo -> nessun limite superiore
      min: mn ?? (mx!=null ? 0 : undefined),
      max: mx ?? (mn!=null ? null : undefined),
      mio: true,
    });
  };
  return (
    <Modal title={t('np_title')} onClose={onClose} onSave={ok?salva:null}
      saveLabel={ok?t('np_save'):t('np_need')} saveBg="linear-gradient(135deg,#be123c,#f43f5e)">
      <Inp lbl={t('np_name')} placeholder={t('np_name_ph')} value={f.n} onChange={e=>sf(p=>({...p,n:e.target.value}))}/>
      <Inp lbl={t('np_unit')} placeholder={t('np_unit_ph')} value={f.u} onChange={e=>sf(p=>({...p,u:e.target.value}))}/>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t('np_range')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Inp lbl={t('np_min')} type="text" inputMode="decimal" placeholder="0" value={f.min} onChange={e=>sf(p=>({...p,min:e.target.value}))}/>
        <Inp lbl={t('np_max')} type="text" inputMode="decimal" placeholder="100" value={f.max} onChange={e=>sf(p=>({...p,max:e.target.value}))}/>
      </div>
      <p className="text-xs text-gray-300 -mt-1">{t('np_range_hint')}</p>
    </Modal>
  );
}

function AnalisiModal({iniziale, parametri=[], onNuovoParam, onSave, onClose}) {
  const [f, sf] = useState(iniziale
    ? {...iniziale, note:iniziale.note||'', params:[...(iniziale.params||[])], allegati:[]}
    : {data:'',note:'',params:[],allegati:[]});
  const caricando = useAllegatiCompleti(iniziale, sf);
  const [sp, setSp] = useState('');
  const [vp, setVp] = useState('');
  const [dp, setDp] = useState(''); // data del singolo valore, se diversa da quella dell'analisi
  const TUTTI = [...PARAMS, ...parametri];
  const mkParam = (name,val,data) => {
    const def=TUTTI.find(p=>p.n===name);
    const p={n:name,u:def?.u||'',v:parseFloat(String(val).replace(',','.')),min:def?.min,max:def?.max};
    if (data && data!==f.data) p.d=data;   // salvata solo se davvero diversa
    return p;
  };
  const pendOk = sp && vp && !isNaN(parseFloat(String(vp).replace(',','.')));
  const addP = () => {
    if (!pendOk) return;
    sf(prev=>({...prev,params:[...prev.params.filter(p=>p.n!==sp),mkParam(sp,vp,dp)]}));
    setSp(''); setVp(''); setDp('');
  };
  const ok = f.data && (f.params.length>0 || pendOk);
  const doSave = () => {
    const params = pendOk ? [...f.params.filter(p=>p.n!==sp),mkParam(sp,vp,dp)] : f.params;
    onSave({...f, params});
  };
  return (
    <Modal title={iniziale?t('edit_test'):t('new_test')} onClose={onClose} onSave={ok?doSave:null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_test')):t('need_test')} saveBg="linear-gradient(135deg,#be123c,#f43f5e)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <ScansionaReferto onFound={ps=>sf(prev=>{
        const nomi=new Set(ps.map(p=>p.n));
        return {...prev, params:[...prev.params.filter(p=>!nomi.has(p.n)), ...ps]};
      })}/>
      <Txt lbl={t('notes_l')} placeholder={t('test_notes_ph')} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
      <div className="mb-3">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t('add_param')}</label>
        <div className="flex gap-2 mb-2">
          <select value={sp} onChange={e=>{ if(e.target.value==='__nuovo__'){ onNuovoParam?.(n=>setSp(n)); } else setSp(e.target.value); }}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400 min-w-0">
            <option value="">{t('choose_param')}</option>
            {TUTTI.filter(p=>!f.params.find(fp=>fp.n===p.n)).map(p=><option key={p.n} value={p.n}>{p.mio?p.n:tv(p.n)}</option>)}
            <option value="__nuovo__">＋ {t('np_option')}</option>
          </select>
          <input type="text" inputMode="decimal" placeholder={t('val_ph')} value={vp} onChange={e=>setVp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addP()}
            className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400 text-center"/>
          <button onClick={addP} className="w-11 h-11 rounded-xl bg-red-500 text-white font-bold text-xl hover:bg-red-600 flex items-center justify-center flex-shrink-0">+</button>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-gray-400 flex-shrink-0">{t('param_date_l')}</label>
          <input type="date" value={dp} onChange={e=>setDp(e.target.value)}
            className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400"/>
          {dp&&<button onClick={()=>setDp('')} className="text-gray-300 hover:text-red-400 font-bold text-lg px-1 flex-shrink-0">×</button>}
        </div>
        {f.params.length>0&&(
          <div className="bg-gray-50 rounded-2xl p-3 space-y-1.5 max-h-40 overflow-y-auto">
            {f.params.map(p=>(
              <div key={p.n} className={`flex items-center justify-between px-3 py-2 rounded-xl ${isAbn(p)?'bg-red-50 border border-red-100':'bg-white'}`}>
                <span className="min-w-0 flex-1">
                  <span className={`block text-xs truncate ${isAbn(p)?'text-red-600 font-semibold':'text-gray-700'}`}>{tv(p.n)}</span>
                  {p.d&&<span className="block text-xs text-gray-300">{fmt(p.d)}</span>}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-bold text-sm ${isAbn(p)?'text-red-600':'text-gray-700'}`}>{p.v}</span>
                  <span className="text-gray-400 text-xs">{p.u}</span>
                  {isAbn(p)&&<span className="text-xs bg-red-500 text-white px-1 py-0.5 rounded-full">!</span>}
                  <button onClick={()=>sf(prev=>({...prev,params:prev.params.filter(x=>x.n!==p.n)}))} className="text-gray-300 hover:text-red-400 font-bold ml-1">×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {caricando
        ? <p className="text-xs text-gray-300 py-2">⏳ {t('loading')}</p>
        : <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>}
    </Modal>
  );
}

function VitaleModal({iniziale, onSave, onClose}) {
  const [f, sf] = useState(iniziale
    ? {data:iniziale.data,tipo:iniziale.tipo,valore:iniziale.valore??'',massima:iniziale.massima??'',minima:iniziale.minima??'',note:iniziale.note||''}
    : {data:'',tipo:VITALI[0].n,valore:'',massima:'',minima:'',note:''});
  const ti = VITALI.find(v=>v.n===f.tipo);
  const isP = f.tipo==='Pressione';
  const pf = s => parseFloat(String(s).replace(',','.'));
  const num = pf(f.valore), nMax = pf(f.massima), nMin = pf(f.minima);
  const ok = f.data && (isP ? (f.massima!=='' && f.minima!=='' && !isNaN(nMax) && !isNaN(nMin)) : (f.valore!=='' && !isNaN(num)));
  const doSave = () => onSave({
    ...(iniziale?{id:iniziale.id}:{}),
    ...(isP ? {data:f.data,tipo:f.tipo,massima:nMax,minima:nMin,note:f.note}
            : {data:f.data,tipo:f.tipo,valore:num,note:f.note}),
  });
  return (
    <Modal title={iniziale?t('edit_vital'):t('new_vital')} onClose={onClose} onSave={ok?doSave:null}
      saveLabel={iniziale?t('save_changes'):t('save')} saveBg="linear-gradient(135deg,#7e22ce,#a855f7)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Sel lbl={t('type_l')} opts={VITALI.map(v=>v.n)} value={f.tipo} onChange={e=>sf(p=>({...p,tipo:e.target.value}))}/>
      {isP ? (
        <div className="grid grid-cols-2 gap-3">
          <Inp lbl={t('max_l')} type="text" inputMode="numeric" placeholder="120" value={f.massima} onChange={e=>sf(p=>({...p,massima:e.target.value}))}/>
          <Inp lbl={t('min_l')} type="text" inputMode="numeric" placeholder="80" value={f.minima} onChange={e=>sf(p=>({...p,minima:e.target.value}))}/>
        </div>
      ) : (
        <Inp lbl={t('value_l',ti?.u)} type="text" inputMode="decimal" placeholder="0.0" value={f.valore} onChange={e=>sf(p=>({...p,valore:e.target.value}))}/>
      )}
      <Txt lbl={t('notes_l')} placeholder={t('vital_notes_ph')} rows={2} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
    </Modal>
  );
}

function AllenamentoModal({iniziale, onSave, onClose}) {
  const [f, sf] = useState(iniziale
    ? {...iniziale, durata:String(iniziale.durata??''), calorie:iniziale.calorie??'', note:iniziale.note||''}
    : {data:'',tipo:SPORT[0].n,durata:'',calorie:'',note:''});
  const num = parseFloat(String(f.durata).replace(',','.'));
  const kcal = parseFloat(String(f.calorie).replace(',','.'));
  const ok = f.data && f.durata && !isNaN(num) && num>0;
  const salva = () => onSave({...f, durata:Math.round(num), calorie: (f.calorie!=='' && !isNaN(kcal) && kcal>0) ? Math.round(kcal) : null});
  return (
    <Modal title={iniziale?t('edit_workout'):t('new_workout')} onClose={onClose} onSave={ok?salva:null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_workout')):t('need_workout')} saveBg="linear-gradient(135deg,#15803d,#22c55e)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <SelAltro lbl={t('activity_l')} opts={SPORT.map(s=>s.n)} value={f.tipo} onChange={v=>sf(p=>({...p,tipo:v}))} placeholder={t('sport_altro_ph')}/>
      <div className="grid grid-cols-2 gap-3">
        <Inp lbl={t('duration_l')} type="text" inputMode="numeric" placeholder={t('duration_ph')} value={f.durata} onChange={e=>sf(p=>({...p,durata:e.target.value}))}/>
        <Inp lbl={t('kcal_l')} type="text" inputMode="numeric" placeholder={t('kcal_ph')} value={f.calorie} onChange={e=>sf(p=>({...p,calorie:e.target.value}))}/>
      </div>
      <Txt lbl={t('notes_l')} placeholder={t('workout_notes_ph')} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
    </Modal>
  );
}

function AllenamentiView({allenamenti, onAdd, onEdit, onDel}) {
  const d = new Date();
  const lun = new Date(d); lun.setDate(d.getDate()-((d.getDay()+6)%7));
  const lunStr = `${lun.getFullYear()}-${String(lun.getMonth()+1).padStart(2,'0')}-${String(lun.getDate()).padStart(2,'0')}`;
  const sett = allenamenti.filter(a=>a.data>=lunStr);
  const minSett = sett.reduce((s,a)=>s+(a.durata||0),0);
  const kcalSett = sett.reduce((s,a)=>s+(Number(a.calorie)||0),0);
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('workouts_title')}</h2><p className="text-xs text-gray-400">{t('workouts_count',allenamenti.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#15803d,#22c55e)'}}>{t('new_m')}</button>
      </div>
      <div className="rounded-2xl p-4 mb-5 flex items-center justify-around text-center" style={{background:'linear-gradient(135deg,#f0fdf4,#dcfce7)'}}>
        <div><p className="text-2xl font-black text-green-700">{sett.length}</p><p className="text-xs text-gray-500">{t('this_week')}</p></div>
        <div className="w-px h-8 bg-green-200"/>
        <div><p className="text-2xl font-black text-green-700">{minSett}<span className="text-sm font-bold"> min</span></p><p className="text-xs text-gray-500">{t('total_time')}</p></div>
        {kcalSett>0&&<>
          <div className="w-px h-8 bg-green-200"/>
          <div><p className="text-2xl font-black" style={{color:'#c2410c'}}>{kcalSett}</p><p className="text-xs text-gray-500">kcal</p></div>
        </>}
      </div>
      {allenamenti.length===0?(
        <div className="text-center py-12"><p className="text-5xl mb-3">💪</p><p className="text-gray-400">{t('no_workouts')}</p></div>
      ):(
        <div className="space-y-3">
          {allenamenti.map(a=>(
            <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 flex items-center gap-3">
              <span className="text-3xl">{sportIcon(a.tipo)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800">{tv(a.tipo)}</p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#f0fdf4',color:'#15803d'}}>{a.durata} min</span>
                  {a.calorie>0&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#fff7ed',color:'#c2410c'}}>🔥 {a.calorie} kcal</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{fmt(a.data)}</p>
                {a.note&&<p className="text-sm text-gray-500 mt-0.5 truncate">{a.note}</p>}
              </div>
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <BtnModifica onClick={()=>onEdit(a)}/>
                <button onClick={()=>onDel(a.id)} className="text-gray-200 hover:text-red-400 transition-colors text-xl">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RicettaModal({iniziale, onSave, onClose}) {
  const [f, sf] = useState(iniziale
    ? {...iniziale, note:iniziale.note||'', allegati:[]}
    : {data:'',descrizione:'',note:'',usata:false,allegati:[]});
  const caricando = useAllegatiCompleti(iniziale, sf);
  const ok = f.data && f.descrizione.trim();
  return (
    <Modal title={iniziale?t('edit_rx'):t('new_rx')} onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_rx')):t('need_rx')} saveBg="linear-gradient(135deg,#0e7490,#06b6d4)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Inp lbl={t('desc_l')} placeholder={t('desc_ph')} value={f.descrizione} onChange={e=>sf(p=>({...p,descrizione:e.target.value}))}/>
      <Txt lbl={t('notes_l')} placeholder={t('rx_notes_ph')} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
      {caricando
        ? <p className="text-xs text-gray-300 py-2">⏳ {t('loading')}</p>
        : <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>}
    </Modal>
  );
}

function RicettaCard({r, onToggle, onEdit, onDel}) {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-50 ${r.usata?'opacity-70':''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs text-gray-400">{fmt(r.data)}</span>
            {r.usata&&<span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">{t('used_badge')}</span>}
          </div>
          <p className={`font-bold ${r.usata?'text-gray-400 line-through':'text-gray-800'}`}>{r.descrizione}</p>
          {r.note&&<p className="text-sm text-gray-500 mt-0.5">{r.note}</p>}
          <InlineAttachments allegati={r.allegati} recordId={r.id}/>
        </div>
        <div className="flex flex-col items-center gap-2 ml-3 flex-shrink-0">
          <button onClick={()=>onToggle(r.id)} title={r.usata?t('mark_unused'):t('mark_used')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base active:scale-95 transition-transform"
            style={{background:r.usata?'#f3f4f6':'#f0fdfa'}}>{r.usata?'↩️':'✔️'}</button>
          <BtnModifica onClick={()=>onEdit(r)}/>
          <button onClick={()=>onDel(r.id)} className="text-gray-200 hover:text-red-400 transition-colors text-xl">🗑</button>
        </div>
      </div>
    </div>
  );
}

function RicetteView({ricette, onAdd, onToggle, onEdit, onDel}) {
  const daUsare = ricette.filter(r=>!r.usata);
  const usate = ricette.filter(r=>r.usata);
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('rx_title')}</h2><p className="text-xs text-gray-400">{t('rx_count',ricette.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#0e7490,#06b6d4)'}}>{t('new_f')}</button>
      </div>
      {ricette.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">📋</p><p className="text-gray-400 px-8">{t('no_rx')}</p></div>
      ):(
        <div>
          {daUsare.length>0&&(
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-wider mb-2" style={{color:'#0e7490'}}>{t('to_use_s',daUsare.length)}</p>
              <div className="space-y-3">{daUsare.map(r=><RicettaCard key={r.id} r={r} onToggle={onToggle} onEdit={onEdit} onDel={onDel}/>)}</div>
            </div>
          )}
          {usate.length>0&&(
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">{t('used_s',usate.length)}</p>
              <div className="space-y-3">{usate.map(r=><RicettaCard key={r.id} r={r} onToggle={onToggle} onEdit={onEdit} onDel={onDel}/>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TerapiaModal({iniziale, problemaId, problemi=[], onPremium, onClose, onSave}) {
  const oggi = new Date().toISOString().slice(0,10);
  const [f, sf] = useState(iniziale
    ? {...iniziale, fine:iniziale.fine||'', dose:iniziale.dose||'', note:iniziale.note||'', orari:iniziale.orari||[], promemoria:!!iniziale.promemoria}
    : {inizio:oggi,fine:'',farmaco:'',dose:'',frequenza:FREQ[0],note:'',problemaId:problemaId||null,orari:[],promemoria:false});
  const ok = f.inizio && f.farmaco.trim();
  const bloccato = ACQUISTI_ATTIVI && !isPremium();

  const setOrario = (i,v) => sf(p=>({...p, orari:p.orari.map((o,j)=>j===i?v:o)}));
  const aggiungiOrario = () => {
    if (bloccato) { onPremium?.(); return; }
    sf(p=>({...p, orari:[...p.orari, p.orari.length?'20:00':'08:00'].slice(0,4), promemoria:true}));
  };
  const togliOrario = i => sf(p=>{ const o=p.orari.filter((_,j)=>j!==i); return {...p, orari:o, promemoria:o.length>0&&p.promemoria}; });
  return (
    <Modal title={iniziale?t('edit_therapy'):t('new_therapy')} onClose={onClose} onSave={ok?()=>onSave({...f,data:f.inizio}):null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_therapy')):t('need_therapy')} saveBg="linear-gradient(135deg,#0f766e,#14b8a6)">
      <Inp lbl={t('drug_l')} placeholder={t('drug_ph')} value={f.farmaco} onChange={e=>sf(p=>({...p,farmaco:e.target.value}))}/>
      <Inp lbl={t('dose_l')} placeholder={t('dose_ph')} value={f.dose} onChange={e=>sf(p=>({...p,dose:e.target.value}))}/>
      <Sel lbl={t('freq_l')} opts={FREQ} value={f.frequenza} onChange={e=>sf(p=>({...p,frequenza:e.target.value}))}/>
      <div className="grid grid-cols-2 gap-3">
        <Inp lbl={t('start_l')} type="date" value={f.inizio} onChange={e=>sf(p=>({...p,inizio:e.target.value}))}/>
        <Inp lbl={t('end_l')} type="date" value={f.fine} onChange={e=>sf(p=>({...p,fine:e.target.value}))}/>
      </div>
      <p className="text-xs text-gray-300 -mt-1 mb-3">{t('end_hint')}</p>

      <div className="rounded-2xl p-3 mb-3" style={{background:'#f0fdfa'}}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-black uppercase tracking-wider" style={{color:'#0f766e'}}>🔔 {t('med_reminders')}</p>
          {f.orari.length>0&&(
            <button onClick={()=>sf(p=>({...p,promemoria:!p.promemoria}))}
              className="w-11 h-6 rounded-full relative transition-colors"
              style={{background:f.promemoria?'#0f766e':'#d1d5db'}}>
              <span className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all" style={{left:f.promemoria?'26px':'4px'}}/>
            </button>
          )}
        </div>
        {f.orari.length===0
          ? <p className="text-xs text-gray-400 mb-2">{t('med_reminders_hint')}</p>
          : <div className="space-y-1.5 mb-2">
              {f.orari.map((o,i)=>(
                <div key={i} className="flex items-center gap-2">
                  <input type="time" value={o} onChange={e=>setOrario(i,e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"/>
                  <button onClick={()=>togliOrario(i)} className="text-gray-300 hover:text-red-400 font-bold text-lg px-1">×</button>
                </div>
              ))}
            </div>}
        {f.orari.length<4&&(
          <button onClick={aggiungiOrario} className="text-xs font-bold" style={{color:'#0f766e'}}>
            {bloccato?`✨ ${t('med_unlock')}`:`+ ${t('med_add_time')}`}
          </button>
        )}
      </div>

      {iniziale&&problemi.length>0&&(
        <div className="mb-3">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t('linked_problem')}</label>
          <select value={f.problemaId||''} onChange={e=>sf(p=>({...p,problemaId:e.target.value?Number(e.target.value):null}))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-400">
            <option value="">{t('no_problem')}</option>
            {problemi.map(p=><option key={p.id} value={p.id}>{p.titolo}</option>)}
          </select>
        </div>
      )}
      <Txt lbl={t('notes_l')} placeholder={t('therapy_notes_ph')} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
    </Modal>
  );
}

function TerapiaCard({x, onEdit, onDel, conclusa}) {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-50 flex items-start gap-3 ${conclusa?'opacity-70':''}`}
      style={{borderLeft:`3px solid ${conclusa?'#d1d5db':'#14b8a6'}`}}>
      <span className="text-2xl">💊</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-bold ${conclusa?'text-gray-400':'text-gray-800'}`}>{x.farmaco}</p>
          {x.dose&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#f0fdfa',color:'#0f766e'}}>{x.dose}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {tv(x.frequenza)}
          {x.promemoria&&x.orari?.length>0&&<span className="ml-2" style={{color:'#0f766e'}}>🔔 {x.orari.join(' · ')}</span>}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{fmt(x.inizio)}{x.fine?` → ${fmt(x.fine)}`:` → ${t('ongoing')}`}</p>
        {x.note&&<p className="text-sm text-gray-500 mt-1">{x.note}</p>}
      </div>
      <div className="flex flex-col items-center gap-2 flex-shrink-0">
        <BtnModifica onClick={()=>onEdit(x)}/>
        <button onClick={()=>onDel(x.id)} className="text-gray-200 hover:text-red-400 transition-colors text-xl">🗑</button>
      </div>
    </div>
  );
}

// --- Cartella clinica: i dati da avere sempre sottomano ---
function CartellaModal({dati, allergie, ultimoPeso, onSave, onClose}) {
  const [f, sf] = useState({
    nome:'', nascita:'', gruppo:'', altezza:'', peso:'',
    emergenzaNome:'', emergenzaTel:'', medicoNome:'', medicoTel:'', note:'', ...(dati||{}),
  });
  const s = (k,v) => sf(p=>({...p,[k]:v}));
  const gravi = allergie.filter(a=>a.gravita==='Grave');
  const num = v => { const n=parseFloat(String(v).replace(',','.')); return isNaN(n)?null:n; };
  const salva = () => onSave({...f, altezza:num(f.altezza), peso:num(f.peso)});

  return (
    <Modal title={t('record_title')} onClose={onClose} onSave={salva} saveLabel={t('save')} saveBg="linear-gradient(135deg,#1e40af,#3b82f6)">
      <p className="text-xs text-gray-400 mb-4">{t('record_desc')}</p>

      <Inp lbl={t('rec_name')} placeholder={t('rec_name_ph')} value={f.nome} onChange={e=>s('nome',e.target.value)}/>
      <Inp lbl={t('rec_birth')} type="date" value={f.nascita} onChange={e=>s('nascita',e.target.value)}/>

      <div className="mb-3">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t('rec_blood')}</label>
        <div className="grid grid-cols-4 gap-2">
          {GRUPPI.map(g=>(
            <button key={g} onClick={()=>s('gruppo', f.gruppo===g?'':g)}
              className="py-2.5 rounded-xl text-sm font-black transition-all border"
              style={f.gruppo===g
                ? {background:'#be123c',color:'white',borderColor:'#be123c'}
                : {background:'white',color:'#6b7280',borderColor:'#e5e7eb'}}>{g}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Inp lbl={t('rec_height')} type="text" inputMode="decimal" placeholder="175" value={f.altezza} onChange={e=>s('altezza',e.target.value)}/>
        <Inp lbl={t('rec_weight')} type="text" inputMode="decimal" placeholder="70" value={f.peso} onChange={e=>s('peso',e.target.value)}/>
      </div>
      {ultimoPeso!=null&&(
        <button onClick={()=>s('peso',String(ultimoPeso))} className="text-xs font-bold mb-3" style={{color:'#1e40af'}}>
          {t('rec_use_last',ultimoPeso)}
        </button>
      )}

      <p className="text-xs font-black text-gray-400 uppercase tracking-wider mt-4 mb-2">🚨 {t('rec_emergency')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Inp lbl={t('rec_contact')} placeholder={t('rec_contact_ph')} value={f.emergenzaNome} onChange={e=>s('emergenzaNome',e.target.value)}/>
        <Inp lbl={t('rec_phone')} type="tel" placeholder="333..." value={f.emergenzaTel} onChange={e=>s('emergenzaTel',e.target.value)}/>
      </div>

      <p className="text-xs font-black text-gray-400 uppercase tracking-wider mt-2 mb-2">👨‍⚕️ {t('rec_doctor')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Inp lbl={t('rec_contact')} placeholder={t('doctor_ph')} value={f.medicoNome} onChange={e=>s('medicoNome',e.target.value)}/>
        <Inp lbl={t('rec_phone')} type="tel" placeholder="06..." value={f.medicoTel} onChange={e=>s('medicoTel',e.target.value)}/>
      </div>

      <Txt lbl={t('rec_notes')} placeholder={t('rec_notes_ph')} rows={3} value={f.note} onChange={e=>s('note',e.target.value)}/>

      {gravi.length>0&&(
        <div className="rounded-2xl p-3 mt-1" style={{background:'#fef2f2',border:'1px solid #fecaca'}}>
          <p className="text-xs font-black uppercase tracking-wider mb-1" style={{color:'#dc2626'}}>⚠️ {t('severe_alert')}</p>
          <p className="text-sm font-bold text-gray-800">{gravi.map(a=>a.sostanza).join(' · ')}</p>
        </div>
      )}
    </Modal>
  );
}

// --- Esami e referti (radiografie, ecografie, urine...) ---
function EsameModal({iniziale, onSave, onClose}) {
  const [f, sf] = useState(iniziale
    ? {...iniziale, struttura:iniziale.struttura||'', esito:iniziale.esito||'', note:iniziale.note||'', costo:iniziale.costo??'', allegati:[]}
    : {data:'',tipo:TIPI_ESAME[0],struttura:'',esito:'',costo:'',note:'',allegati:[]});
  const caricando = useAllegatiCompleti(iniziale, sf);
  const s = (k,v) => sf(p=>({...p,[k]:v}));
  const ok = f.data && String(f.tipo).trim();
  const salva = () => {
    const c = parseFloat(String(f.costo).replace(',','.'));
    onSave({...f, costo:(f.costo!=='' && !isNaN(c)) ? c : null});
  };
  return (
    <Modal title={iniziale?t('edit_exam'):t('new_exam')} onClose={onClose} onSave={ok?salva:null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_exam')):t('need_exam')} saveBg="linear-gradient(135deg,#4338ca,#6366f1)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>s('data',e.target.value)}/>
      <SelAltro lbl={t('exam_type_l')} opts={TIPI_ESAME} value={f.tipo} onChange={v=>s('tipo',v)} placeholder={t('exam_altro_ph')}/>
      <Inp lbl={t('exam_where_l')} placeholder={t('exam_where_ph')} value={f.struttura} onChange={e=>s('struttura',e.target.value)}/>
      <Txt lbl={t('exam_result_l')} placeholder={t('exam_result_ph')} rows={4} value={f.esito} onChange={e=>s('esito',e.target.value)}/>
      <Inp lbl={t('cost_l')} type="text" inputMode="decimal" placeholder={t('cost_ph')} value={f.costo} onChange={e=>s('costo',e.target.value)}/>
      <Txt lbl={t('notes_l')} placeholder={t('exam_notes_ph')} rows={2} value={f.note} onChange={e=>s('note',e.target.value)}/>
      {caricando
        ? <p className="text-xs text-gray-300 py-2">⏳ {t('loading')}</p>
        : <AttachmentPicker files={f.allegati} onChange={v=>s('allegati',v)}/>}
    </Modal>
  );
}

function ViewEsameModal({e, onEdit, onClose}) {
  return (
    <Modal title={`${esameIcon(e.tipo)} ${tv(e.tipo)}`} onClose={onClose}
      onSave={onEdit?()=>onEdit(e):null} saveLabel={`✏️ ${t('edit')}`} saveBg="linear-gradient(135deg,#4338ca,#6366f1)">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-2xl p-3" style={{background:'#eef2ff'}}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{color:'#4338ca'}}>{t('h_date')}</p>
          <p className="font-bold text-sm mt-1" style={{color:'#4338ca'}}>{fmt(e.data)}</p>
        </div>
        {e.costo!=null&&e.costo!==''&&(
          <div className="rounded-2xl p-3" style={{background:'#f0fdf4'}}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{color:'#166534'}}>{t('cost_v')}</p>
            <p className="font-bold text-sm mt-1" style={{color:'#166534'}}>{eur(e.costo)}</p>
          </div>
        )}
      </div>
      {e.struttura&&<div className="bg-gray-50 rounded-2xl p-3 mb-3"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('exam_where_l')}</p><p className="text-sm text-gray-700">{e.struttura}</p></div>}
      {e.esito&&<div className="bg-gray-50 rounded-2xl p-3 mb-3"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('exam_result_l')}</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{e.esito}</p></div>}
      {e.note&&<div className="bg-gray-50 rounded-2xl p-3"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('notes_l')}</p><p className="text-sm text-gray-600 italic">{e.note}</p></div>}
      <InlineAttachments allegati={e.allegati} recordId={e.id}/>
    </Modal>
  );
}

function EsamiView({esami, onAdd, onEdit, onDel, onView}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('exams_title')}</h2><p className="text-xs text-gray-400">{t('exams_count',esami.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#4338ca,#6366f1)'}}>{t('new_m')}</button>
      </div>
      {esami.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">🩻</p><p className="text-gray-400 px-8">{t('no_exams')}</p></div>
      ):(
        <div className="space-y-3">
          {esami.map(e=>(
            <div key={e.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:shadow-md transition-all"
              style={{borderLeft:'3px solid #6366f1'}} onClick={()=>onView(e)}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{esameIcon(e.tipo)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800">{tv(e.tipo)}</p>
                    <span className="text-xs text-gray-400">{fmt(e.data)}</span>
                    {e.costo!=null&&e.costo!==''&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#f0fdf4',color:'#166534'}}>{eur(e.costo)}</span>}
                    {e.allegati?.length>0&&<span className="text-xs text-blue-400">📎 {e.allegati.length}</span>}
                  </div>
                  {e.struttura&&<p className="text-xs text-gray-400 mt-0.5">{e.struttura}</p>}
                  {e.esito&&<p className="text-sm text-gray-500 mt-1 truncate">{e.esito}</p>}
                  <p className="text-xs text-gray-300 mt-1">{t('tap_details')}</p>
                </div>
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <BtnModifica onClick={()=>onEdit(e)}/>
                  <button onClick={ev=>{ev.stopPropagation();onDel(e.id)}} className="text-gray-200 hover:text-red-400 text-xl">🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Allergie ---
function AllergiaModal({iniziale, onSave, onClose}) {
  const oggi = new Date().toISOString().slice(0,10);
  const [f, sf] = useState(iniziale
    ? {...iniziale, sintomi:iniziale.sintomi||'', note:iniziale.note||'', allegati:[]}
    : {data:oggi,sostanza:'',tipo:TIPI_ALLERGIA[0],gravita:GRAVITA[0],sintomi:'',note:'',allegati:[]});
  const caricando = useAllegatiCompleti(iniziale, sf);
  const ok = f.sostanza.trim();
  return (
    <Modal title={iniziale?t('edit_allergy'):t('new_allergy')} onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_allergy')):t('need_allergy')} saveBg="linear-gradient(135deg,#9f1239,#e11d48)">
      <Inp lbl={t('substance_l')} placeholder={t('substance_ph')} value={f.sostanza} onChange={e=>sf(p=>({...p,sostanza:e.target.value}))}/>
      <SelAltro lbl={t('allergy_type_l')} opts={TIPI_ALLERGIA} value={f.tipo} onChange={v=>sf(p=>({...p,tipo:v}))} placeholder={t('allergia_altro_ph')}/>
      <div className="mb-3">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t('severity_l')}</label>
        <div className="flex gap-2">
          {GRAVITA.map(g=>(
            <button key={g} onClick={()=>sf(p=>({...p,gravita:g}))}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border"
              style={f.gravita===g
                ? {background:coloreGravita(g),color:'white',borderColor:coloreGravita(g)}
                : {background:'white',color:'#6b7280',borderColor:'#e5e7eb'}}>{tv(g)}</button>
          ))}
        </div>
      </div>
      <Txt lbl={t('symptoms_l')} placeholder={t('symptoms_ph')} rows={3} value={f.sintomi} onChange={e=>sf(p=>({...p,sintomi:e.target.value}))}/>
      <Inp lbl={t('discovered_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Txt lbl={t('notes_l')} placeholder={t('allergy_notes_ph')} rows={2} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
      {caricando
        ? <p className="text-xs text-gray-300 py-2">⏳ {t('loading')}</p>
        : <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>}
    </Modal>
  );
}

function AllergieView({allergie, onAdd, onEdit, onDel, onView}) {
  const gravi = allergie.filter(a=>a.gravita==='Grave');
  const ordinate = [...allergie].sort((a,b)=>GRAVITA.indexOf(b.gravita)-GRAVITA.indexOf(a.gravita));
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('allergies_title')}</h2><p className="text-xs text-gray-400">{t('allergies_count',allergie.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#9f1239,#e11d48)'}}>{t('new_f')}</button>
      </div>

      {gravi.length>0&&(
        <div className="rounded-2xl p-4 mb-5" style={{background:'#fef2f2',border:'1px solid #fecaca'}}>
          <p className="text-xs font-black uppercase tracking-wider mb-1" style={{color:'#dc2626'}}>⚠️ {t('severe_alert')}</p>
          <p className="text-sm font-bold text-gray-800">{gravi.map(a=>a.sostanza).join(' · ')}</p>
          <p className="text-xs text-gray-500 mt-1">{t('severe_hint')}</p>
        </div>
      )}

      {allergie.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">⚠️</p><p className="text-gray-400 px-8">{t('no_allergies')}</p></div>
      ):(
        <div className="space-y-3">
          {ordinate.map(a=>(
            <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:shadow-md transition-all"
              style={{borderLeft:`3px solid ${coloreGravita(a.gravita)}`}} onClick={()=>onView(a)}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{allergiaIcon(a.tipo)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800">{a.sostanza}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{background:coloreGravita(a.gravita)}}>{tv(a.gravita)}</span>
                    {a.allegati?.length>0&&<span className="text-xs text-blue-400">📎 {a.allegati.length}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{tv(a.tipo)}</p>
                  {a.sintomi&&<p className="text-sm text-gray-500 mt-1 truncate">{a.sintomi}</p>}
                </div>
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <BtnModifica onClick={()=>onEdit(a)}/>
                  <button onClick={e=>{e.stopPropagation();onDel(a.id)}} className="text-gray-200 hover:text-red-400 text-xl">🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewAllergiaModal({a, onEdit, onClose}) {
  return (
    <Modal title={`${allergiaIcon(a.tipo)} ${a.sostanza}`} onClose={onClose}
      onSave={onEdit?()=>onEdit(a):null} saveLabel={`✏️ ${t('edit')}`} saveBg="linear-gradient(135deg,#9f1239,#e11d48)">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-2xl p-3" style={{background:'#fff1f2'}}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{color:'#9f1239'}}>{t('allergy_type_l')}</p>
          <p className="font-bold text-sm mt-1" style={{color:'#9f1239'}}>{tv(a.tipo)}</p>
        </div>
        <div className="rounded-2xl p-3" style={{background:'#fff1f2'}}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{color:'#9f1239'}}>{t('severity_l')}</p>
          <p className="font-bold text-sm mt-1" style={{color:coloreGravita(a.gravita)}}>{tv(a.gravita)}</p>
        </div>
      </div>
      {a.sintomi&&<div className="bg-gray-50 rounded-2xl p-3 mb-3"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('symptoms_l')}</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{a.sintomi}</p></div>}
      {a.data&&<p className="text-xs text-gray-400 mb-2">{t('discovered_l')}: {fmt(a.data)}</p>}
      {a.note&&<div className="bg-gray-50 rounded-2xl p-3"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('notes_l')}</p><p className="text-sm text-gray-600 italic">{a.note}</p></div>}
      <InlineAttachments allegati={a.allegati} recordId={a.id}/>
    </Modal>
  );
}

// --- Diario clinico ---
function ProblemaModal({iniziale, onSave, onClose}) {
  const oggi = new Date().toISOString().slice(0,10);
  const [f, sf] = useState(iniziale
    ? {...iniziale, descrizione:iniziale.descrizione||'', allegati:[]}
    : {data:oggi,titolo:'',descrizione:'',stato:'aperto',allegati:[],aggiornamenti:[],visite:[],analisi:[]});
  const caricando = useAllegatiCompleti(iniziale, sf);
  const ok = f.data && f.titolo.trim();
  return (
    <Modal title={iniziale?t('edit_problem'):t('new_problem')} onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_problem')):t('need_problem')} saveBg="linear-gradient(135deg,#7c2d12,#ea580c)">
      <Inp lbl={t('problem_l')} placeholder={t('problem_ph')} value={f.titolo} onChange={e=>sf(p=>({...p,titolo:e.target.value}))}/>
      <Inp lbl={t('problem_start_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Txt lbl={t('problem_desc_l')} placeholder={t('problem_desc_ph')} rows={4} value={f.descrizione} onChange={e=>sf(p=>({...p,descrizione:e.target.value}))}/>
      {caricando
        ? <p className="text-xs text-gray-300 py-2">⏳ {t('loading')}</p>
        : <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>}
    </Modal>
  );
}

const coloreDolore = n => n==null ? '#d1d5db' : n<=3 ? '#22c55e' : n<=6 ? '#f59e0b' : '#ef4444';

// Gli aggiornamenti vivono dentro il problema, ma i loro allegati si salvano a parte come per gli altri record
const metaAllegati = (all=[]) => all.map(({id,name,type,size})=>({id,name,type,size}));
const salvaAllegatiAgg = async (id, all=[]) => {
  try {
    if (all.length>0) await window.storage.set(`ht-att-${id}`, JSON.stringify(all));
    else await window.storage.delete(`ht-att-${id}`);
  } catch(e){}
};

function AggiornamentoModal({iniziale, onSave, onClose}) {
  const oggi = new Date().toISOString().slice(0,10);
  const [f, sf] = useState(iniziale
    ? {...iniziale, testo:iniziale.testo||'', allegati:[]}
    : {data:oggi,testo:'',livello:null,allegati:[]});
  const caricando = useAllegatiCompleti(iniziale, sf);
  const ok = f.data && f.testo.trim();
  return (
    <Modal title={iniziale?t('edit_update'):t('new_update')} onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_update')):t('need_update')} saveBg="linear-gradient(135deg,#7c2d12,#ea580c)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('level_l')}</label>
          {f.livello!=null&&<button onClick={()=>sf(p=>({...p,livello:null}))} className="text-xs text-gray-300 font-bold">{t('level_clear')}</button>}
        </div>
        <div className="flex gap-1">
          {[0,1,2,3,4,5,6,7,8,9,10].map(n=>(
            <button key={n} onClick={()=>sf(p=>({...p,livello:n}))}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
              style={f.livello===n
                ? {background:coloreDolore(n),color:'white'}
                : {background:'#f3f4f6',color:'#9ca3af'}}>{n}</button>
          ))}
        </div>
        <p className="text-xs text-gray-300 mt-1">{t('level_hint')}</p>
      </div>
      <Txt lbl={t('update_l')} placeholder={t('update_ph')} rows={5} value={f.testo} onChange={e=>sf(p=>({...p,testo:e.target.value}))}/>
      {caricando
        ? <p className="text-xs text-gray-300 py-2">⏳ {t('loading')}</p>
        : <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>}
    </Modal>
  );
}

function AndamentoDolore({aggiornamenti}) {
  const punti = aggiornamenti.filter(a=>a.livello!=null)
    .slice().sort((x,y)=>String(x.data).localeCompare(String(y.data)))
    .map(a=>({df:fmt(a.data), val:a.livello}));
  if (punti.length<2) return null;
  const primo=punti[0].val, ultimo=punti[punti.length-1].val, d=ultimo-primo;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">{t('level_trend')}</p>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{background:d<0?'#f0fdf4':d>0?'#fff1f2':'#f3f4f6',color:d<0?'#166534':d>0?'#be123c':'#6b7280'}}>
          {d===0?'=':d>0?'↑':'↓'} {Math.abs(d)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={punti} margin={{top:5,right:10,left:-30,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5"/>
          <XAxis dataKey="df" tick={{fontSize:9,fill:'#9ca3af'}}/>
          <YAxis domain={[0,10]} ticks={[0,5,10]} tick={{fontSize:10,fill:'#9ca3af'}} width={40}/>
          <Tooltip formatter={v=>[`${v}/10`,t('level_l')]} contentStyle={{fontSize:11,borderRadius:16,border:'none',boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}/>
          <Line type="monotone" dataKey="val" stroke="#ea580c" strokeWidth={2.5}
            dot={({cx,cy,payload})=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={coloreDolore(payload.val)}/>}
            activeDot={{r:6}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CollegaModal({titolo, elementi, selezionati, onSave, onClose}) {
  const [sel, setSel] = useState(new Set(selezionati||[]));
  const flip = id => setSel(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  return (
    <Modal title={titolo} onClose={onClose} onSave={()=>onSave([...sel])} saveLabel={t('link_save')} saveBg="linear-gradient(135deg,#7c2d12,#ea580c)">
      {elementi.length===0
        ? <p className="text-sm text-gray-300 text-center py-8">{t('link_empty')}</p>
        : <div className="space-y-2">
            {elementi.map(e=>(
              <label key={e.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-3 cursor-pointer">
                <input type="checkbox" checked={sel.has(e.id)} onChange={()=>flip(e.id)} className="w-4 h-4 accent-orange-500 flex-shrink-0"/>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-800 truncate">{e.tit}</span>
                  {e.sub&&<span className="block text-xs text-gray-400 truncate">{e.sub}</span>}
                </span>
                <span className="text-xs text-gray-300 flex-shrink-0">{fmt(e.data)}</span>
              </label>
            ))}
          </div>}
    </Modal>
  );
}

function Sezione({icona, titolo, azione, children}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">{icona} {titolo}</p>
        {azione}
      </div>
      {children}
    </div>
  );
}

function ProblemaDetail({p, terapie, visite, analisi, note, allenamenti,
  onBack, onEdit, onStato, onAddTer, onEditTer, onDelTer,
  onAddAgg, onEditAgg, onDelAgg, onLinkV, onLinkA, onLinkN, onLinkS,
  onApriV, onApriA, onApriN, onEditS}) {
  const mie = terapie.filter(x=>x.problemaId===p.id);
  const oggi = new Date().toISOString().slice(0,10);
  const vLink = visite.filter(v=>(p.visite||[]).includes(v.id));
  const aLink = analisi.filter(a=>(p.analisi||[]).includes(a.id));
  const nLink = note.filter(n=>(p.note||[]).includes(n.id));
  const sLink = allenamenti.filter(s=>(p.allenamenti||[]).includes(s.id));
  const agg = [...(p.aggiornamenti||[])].sort((x,y)=>String(y.data).localeCompare(String(x.data)));
  const risolto = p.stato==='risolto';
  const Piu = ({onClick}) => (
    <button onClick={onClick} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{background:'#fff7ed',color:'#c2410c'}}>+ {t('add_short')}</button>
  );
  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-400 font-bold mb-3">← {t('back')}</button>
      <div className="rounded-2xl p-4 mb-5" style={{background:risolto?'#f9fafb':'linear-gradient(135deg,#fff7ed,#ffedd5)'}}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className={`text-lg font-black ${risolto?'text-gray-400':'text-gray-800'}`}>{p.titolo}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t('since')} {fmt(p.data)}</p>
          </div>
          <BtnModifica onClick={onEdit}/>
        </div>
        {p.descrizione&&<p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{p.descrizione}</p>}
        <button onClick={()=>onStato(risolto?'aperto':'risolto')}
          className="mt-3 w-full py-2 rounded-xl text-xs font-bold"
          style={risolto?{background:'#fff7ed',color:'#c2410c'}:{background:'#f0fdf4',color:'#166534'}}>
          {risolto?`↩️ ${t('reopen')}`:`✅ ${t('mark_solved')}`}
        </button>
        <InlineAttachments allegati={p.allegati} recordId={p.id}/>
      </div>

      <AndamentoDolore aggiornamenti={p.aggiornamenti||[]}/>

      <Sezione icona="💊" titolo={t('therapies_title')} azione={<Piu onClick={onAddTer}/>}>
        {mie.length===0
          ? <p className="text-xs text-gray-300 py-2">{t('none_yet')}</p>
          : <div className="space-y-2">{mie.map(x=>
              <TerapiaCard key={x.id} x={x} onEdit={onEditTer} onDel={onDelTer} conclusa={x.fine&&x.fine<oggi}/>)}</div>}
      </Sezione>

      <Sezione icona="📝" titolo={t('updates_title')} azione={<Piu onClick={onAddAgg}/>}>
        {agg.length===0
          ? <p className="text-xs text-gray-300 py-2">{t('none_yet')}</p>
          : <div className="space-y-2">
              {agg.map(a=>(
                <div key={a.id} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50 flex items-start gap-3" style={{borderLeft:`3px solid ${a.livello!=null?coloreDolore(a.livello):'#ea580c'}`}}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-gray-400">{fmt(a.data)}</p>
                      {a.livello!=null&&<span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{background:coloreDolore(a.livello)}}>{a.livello}/10</span>}
                      {a.allegati?.length>0&&<span className="text-xs text-blue-400">📎 {a.allegati.length}</span>}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{a.testo}</p>
                    <InlineAttachments allegati={a.allegati} recordId={a.id}/>
                  </div>
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <BtnModifica onClick={()=>onEditAgg(a)}/>
                    <button onClick={()=>onDelAgg(a.id)} className="text-gray-200 hover:text-red-400 text-lg">🗑</button>
                  </div>
                </div>
              ))}
            </div>}
      </Sezione>

      <Sezione icona="👨‍⚕️" titolo={t('visits_title')} azione={<Piu onClick={onLinkV}/>}>
        {vLink.length===0
          ? <p className="text-xs text-gray-300 py-2">{t('none_linked')}</p>
          : <div className="space-y-2">{vLink.map(v=>(
              <button key={v.id} onClick={()=>onApriV(v)} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm border border-gray-50 flex items-center gap-2 hover:shadow-md transition-all">
                <span className="text-lg">👨‍⚕️</span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-bold text-gray-800 truncate">Dr. {v.medico}</span>
                <span className="block text-xs text-gray-400 truncate">{tv(v.spec)}</span></span>
                <span className="text-xs text-gray-300">{fmt(v.data)}</span>
                <span className="text-gray-300">›</span>
              </button>))}</div>}
      </Sezione>

      <Sezione icona="🩸" titolo={t('tests_title')} azione={<Piu onClick={onLinkA}/>}>
        {aLink.length===0
          ? <p className="text-xs text-gray-300 py-2">{t('none_linked')}</p>
          : <div className="space-y-2">{aLink.map(a=>(
              <button key={a.id} onClick={()=>onApriA(a)} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm border border-gray-50 flex items-center gap-2 hover:shadow-md transition-all">
                <span className="text-lg">🩸</span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-bold text-gray-800">{t('params_n',(a.params||[]).length)}</span></span>
                <span className="text-xs text-gray-300">{fmt(a.data)}</span>
                <span className="text-gray-300">›</span>
              </button>))}</div>}
      </Sezione>

      <Sezione icona="📒" titolo={t('notes_title')} azione={<Piu onClick={onLinkN}/>}>
        {nLink.length===0
          ? <p className="text-xs text-gray-300 py-2">{t('none_linked')}</p>
          : <div className="space-y-2">{nLink.map(n=>(
              <button key={n.id} onClick={()=>onApriN(n)} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm border border-gray-50 flex items-center gap-2 hover:shadow-md transition-all">
                <span className="text-lg">📝</span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-bold text-gray-800 truncate">{n.titolo}</span>
                {n.testo&&<span className="block text-xs text-gray-400 truncate">{n.testo}</span>}</span>
                <span className="text-xs text-gray-300">{fmt(n.data)}</span>
                <span className="text-gray-300">›</span>
              </button>))}</div>}
      </Sezione>

      <Sezione icona="💪" titolo={t('workouts_title')} azione={<Piu onClick={onLinkS}/>}>
        {sLink.length===0
          ? <p className="text-xs text-gray-300 py-2">{t('none_linked')}</p>
          : <div className="space-y-2">{sLink.map(s=>(
              <button key={s.id} onClick={()=>onEditS(s)} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm border border-gray-50 flex items-center gap-2 hover:shadow-md transition-all">
                <span className="text-lg">{sportIcon(s.tipo)}</span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-bold text-gray-800 truncate">{tv(s.tipo)}</span>
                <span className="block text-xs text-gray-400">{s.durata} min</span></span>
                <span className="text-xs text-gray-300">{fmt(s.data)}</span>
                <span className="text-gray-300">›</span>
              </button>))}</div>}
      </Sezione>
    </div>
  );
}

function DiarioView({problemi, terapie, onAdd, onOpen, onDel, onEditTer, onDelTer}) {
  const orfane = terapie.filter(x=>!x.problemaId);
  const aperti = problemi.filter(p=>p.stato!=='risolto');
  const risolti = problemi.filter(p=>p.stato==='risolto');
  const oggi = new Date().toISOString().slice(0,10);
  const Card = ({p}) => {
    const nTer = terapie.filter(x=>x.problemaId===p.id && (!x.fine||x.fine>=oggi)).length;
    const nAgg = (p.aggiornamenti||[]).length;
    const risolto = p.stato==='risolto';
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:shadow-md transition-all"
        style={{borderLeft:`3px solid ${risolto?'#d1d5db':'#ea580c'}`}} onClick={()=>onOpen(p)}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-1">{t('since')} {fmt(p.data)}</p>
            <p className={`font-bold ${risolto?'text-gray-400':'text-gray-800'}`}>{p.titolo}</p>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {nTer>0&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#f0fdfa',color:'#0f766e'}}>💊 {nTer}</span>}
              {nAgg>0&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#fff7ed',color:'#c2410c'}}>📝 {nAgg}</span>}
              {p.allegati?.length>0&&<span className="text-xs text-blue-400">📎 {p.allegati.length}</span>}
            </div>
            <p className="text-xs text-gray-300 mt-1">{t('tap_details')}</p>
          </div>
          <button onClick={e=>{e.stopPropagation();onDel(p.id)}} className="text-gray-200 hover:text-red-400 text-xl ml-3 flex-shrink-0">🗑</button>
        </div>
      </div>
    );
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('diary_title')}</h2><p className="text-xs text-gray-400">{t('diary_count',aperti.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#7c2d12,#ea580c)'}}>{t('new_m')}</button>
      </div>
      {problemi.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">📔</p><p className="text-gray-400 px-8">{t('no_problems')}</p></div>
      ):(
        <div>
          {aperti.length>0&&(
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-wider mb-2" style={{color:'#c2410c'}}>{t('open_s',aperti.length)}</p>
              <div className="space-y-3">{aperti.map(p=><Card key={p.id} p={p}/>)}</div>
            </div>
          )}
          {risolti.length>0&&(
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">{t('solved_s',risolti.length)}</p>
              <div className="space-y-3">{risolti.map(p=><Card key={p.id} p={p}/>)}</div>
            </div>
          )}
        </div>
      )}
      {orfane.length>0&&(
        <div className="mt-6">
          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">💊 {t('unlinked_therapies',orfane.length)}</p>
          <p className="text-xs text-gray-300 mb-2">{t('unlinked_hint')}</p>
          <div className="space-y-3">{orfane.map(x=><TerapiaCard key={x.id} x={x} onEdit={onEditTer} onDel={onDelTer}/>)}</div>
        </div>
      )}
    </div>
  );
}

function NotaModal({iniziale, onSave, onClose}) {
  const oggi = new Date().toISOString().slice(0,10);
  const [f, sf] = useState(iniziale
    ? {...iniziale, testo:iniziale.testo||'', allegati:[]}
    : {data:oggi,titolo:'',testo:'',allegati:[]});
  const caricando = useAllegatiCompleti(iniziale, sf);
  const ok = f.data && f.titolo.trim();
  return (
    <Modal title={iniziale?t('edit_note'):t('new_note')} onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_note')):t('need_note')} saveBg="linear-gradient(135deg,#b45309,#f59e0b)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Inp lbl={t('title_l')} placeholder={t('title_ph')} value={f.titolo} onChange={e=>sf(p=>({...p,titolo:e.target.value}))}/>
      <Txt lbl={t('text_l')} placeholder={t('text_ph')} rows={6} value={f.testo} onChange={e=>sf(p=>({...p,testo:e.target.value}))}/>
      {caricando
        ? <p className="text-xs text-gray-300 py-2">⏳ {t('loading')}</p>
        : <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>}
    </Modal>
  );
}

function ViewNotaModal({n, onEdit, onClose}) {
  return (
    <Modal title={`📝 ${n.titolo}`} onClose={onClose}
      onSave={onEdit?()=>onEdit(n):null} saveLabel={`✏️ ${t('edit')}`} saveBg="linear-gradient(135deg,#b45309,#f59e0b)">
      <p className="text-xs text-gray-400 mb-3">{fmt(n.data)}</p>
      {n.testo
        ? <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{n.testo}</p>
        : <p className="text-sm text-gray-300 italic">{t('note_empty')}</p>}
      <InlineAttachments allegati={n.allegati} recordId={n.id}/>
    </Modal>
  );
}

function NotaCard({n, onArch, onDel, onView}) {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:shadow-md transition-all ${n.archiviata?'opacity-70':''}`}
      style={{borderLeft:`3px solid ${n.archiviata?'#d1d5db':'#f59e0b'}`}} onClick={()=>onView(n)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-1">{fmt(n.data)}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-bold ${n.archiviata?'text-gray-400':'text-gray-800'}`}>{n.titolo}</p>
            {n.allegati?.length>0&&<span className="text-xs text-blue-400 font-medium">📎 {n.allegati.length}</span>}
          </div>
          {n.testo&&<p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.testo}</p>}
          <p className="text-xs text-gray-300 mt-1">{t('tap_details')}</p>
        </div>
        <div className="flex flex-col items-center gap-2 ml-3 flex-shrink-0">
          <button onClick={e=>{e.stopPropagation();onArch(n.id)}} title={n.archiviata?t('unarchive'):t('archive')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base active:scale-95 transition-transform"
            style={{background:n.archiviata?'#f3f4f6':'#fffbeb'}}>{n.archiviata?'↩️':'📦'}</button>
          <button onClick={e=>{e.stopPropagation();onDel(n.id)}} className="text-gray-200 hover:text-red-400 transition-colors text-xl">🗑</button>
        </div>
      </div>
    </div>
  );
}

function NoteView({note, onAdd, onArch, onDel, onView}) {
  const [showArch, setShowArch] = useState(false);
  const attive = note.filter(n=>!n.archiviata);
  const archiviate = note.filter(n=>n.archiviata);
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('notes_title')}</h2><p className="text-xs text-gray-400">{t('notes_count',attive.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#b45309,#f59e0b)'}}>{t('new_f')}</button>
      </div>
      {note.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">📝</p><p className="text-gray-400 px-8">{t('no_notes')}</p></div>
      ):(
        <div>
          {attive.length>0
            ? <div className="space-y-3">{attive.map(n=><NotaCard key={n.id} n={n} onArch={onArch} onDel={onDel} onView={onView}/>)}</div>
            : <div className="text-center py-10"><p className="text-4xl mb-2">📝</p><p className="text-gray-400 text-sm">{t('no_active_notes')}</p></div>}

          {archiviate.length>0&&(
            <div className="mt-6">
              <button onClick={()=>setShowArch(v=>!v)} className="w-full flex items-center gap-2 py-2 text-xs font-black text-gray-400 uppercase tracking-wider">
                <span>{showArch?'▾':'›'}</span>
                <span>{t('archived_s',archiviate.length)}</span>
              </button>
              {showArch&&<div className="space-y-3 mt-2">{archiviate.map(n=><NotaCard key={n.id} n={n} onArch={onArch} onDel={onDel} onView={onView}/>)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ViewVisitaModal({v, onEdit, onClose}) {
  return (
    <Modal title={t('visit_of',fmt(v.data))} onClose={onClose}
      onSave={onEdit?()=>onEdit(v):null} saveLabel={`✏️ ${t('edit')}`} saveBg="linear-gradient(135deg,#1e40af,#3b82f6)">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-blue-50 rounded-2xl p-3"><p className="text-xs text-blue-400 font-bold uppercase tracking-wide">{t('doctor_v')}</p><p className="font-bold text-blue-800 text-sm mt-1">Dr. {v.medico}</p></div>
        <div className="bg-blue-50 rounded-2xl p-3"><p className="text-xs text-blue-400 font-bold uppercase tracking-wide">{t('spec_v')}</p><p className="font-bold text-blue-800 text-sm mt-1">{tv(v.spec)}</p></div>
      </div>
      {v.costo!=null&&v.costo!==''&&<div className="rounded-2xl p-3 mb-3 flex items-center justify-between" style={{background:'#f0fdf4'}}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{color:'#166534'}}>{t('cost_v')}</p>
        <p className="font-black" style={{color:'#166534'}}>{eur(v.costo)}</p>
      </div>}
      {v.diagnosi&&<div className="bg-gray-50 rounded-2xl p-3 mb-3"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('diag_l')}</p><p className="text-sm text-gray-700">{v.diagnosi}</p></div>}
      {v.note&&<div className="bg-gray-50 rounded-2xl p-3 mb-2"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('notes_l')}</p><p className="text-sm text-gray-600 italic">{v.note}</p></div>}
      <InlineAttachments allegati={v.allegati} recordId={v.id}/>
    </Modal>
  );
}

function ViewAnalisiModal({a, onEdit, onClose}) {
  const params=a.params||[], totAbn=params.filter(isAbn).length;
  return (
    <Modal title={t('test_of',fmt(a.data))} onClose={onClose}
      onSave={onEdit?()=>onEdit(a):null} saveLabel={`✏️ ${t('edit')}`} saveBg="linear-gradient(135deg,#be123c,#f43f5e)">
      {a.note&&<div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600 mb-4 italic">"{a.note}"</div>}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-50 rounded-2xl p-4 text-center"><p className="text-3xl font-bold text-blue-700">{params.length}</p><p className="text-xs text-blue-400 font-semibold mt-0.5">{t('params_l')}</p></div>
        <div className={`rounded-2xl p-4 text-center ${totAbn>0?'bg-red-50':'bg-green-50'}`}><p className={`text-3xl font-bold ${totAbn>0?'text-red-600':'text-green-600'}`}>{totAbn}</p><p className={`text-xs font-semibold mt-0.5 ${totAbn>0?'text-red-400':'text-green-400'}`}>{totAbn>0?t('abn_l'):t('all_ok_s')}</p></div>
      </div>
      <div className="space-y-2">
        {params.map(p=>(
          <div key={p.n} className={`flex justify-between items-center p-3.5 rounded-2xl ${isAbn(p)?'bg-red-50 border border-red-100':'bg-gray-50'}`}>
            <div>
              <p className={`text-sm font-semibold ${isAbn(p)?'text-red-700':'text-gray-700'}`}>{tv(p.n)}</p>
              {p.d&&<p className="text-xs text-blue-400 mt-0.5">📅 {fmt(p.d)}</p>}
              {refRange(p)!==null&&<p className="text-xs text-gray-400 mt-0.5">{t('ref')} {refRange(p)} {p.u}</p>}
            </div>
            <div className="flex items-center gap-2">
              {isAbn(p)&&<span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">!</span>}
              <div className="text-right"><p className={`font-bold text-base ${isAbn(p)?'text-red-600':'text-gray-800'}`}>{p.v}</p><p className="text-xs text-gray-400">{p.u}</p></div>
            </div>
          </div>
        ))}
      </div>
      <InlineAttachments allegati={a.allegati} recordId={a.id}/>
    </Modal>
  );
}

function SearchModal({dati, onGo, onClose}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const has = (...campi) => campi.some(c=>String(c||'').toLowerCase().includes(query));

  const risultati = query.length<2 ? [] : [
    ...dati.visite.filter(v=>has(v.medico,v.spec,tv(v.spec),v.diagnosi,v.note))
      .map(v=>({id:'v'+v.id,tab:'visite',i:'👨‍⚕️',tit:`Dr. ${v.medico}`,sub:v.diagnosi||tv(v.spec),data:v.data})),
    ...dati.analisi.filter(a=>has(a.note,...(a.params||[]).flatMap(p=>[p.n,tv(p.n)])))
      .map(a=>({id:'a'+a.id,tab:'analisi',i:'🩸',tit:t('test_of',fmt(a.data)),sub:t('params_n',(a.params||[]).length),data:a.data})),
    ...dati.note.filter(n=>has(n.titolo,n.testo))
      .map(n=>({id:'n'+n.id,tab:'note',i:'📝',tit:n.titolo,sub:n.testo,data:n.data})),
    ...dati.ricette.filter(r=>has(r.descrizione,r.note))
      .map(r=>({id:'r'+r.id,tab:'ricette',i:'📋',tit:r.descrizione,sub:r.note,data:r.data})),
    ...dati.terapie.filter(x=>has(x.farmaco,x.dose,x.note))
      .map(x=>({id:'t'+x.id,tab:'diario',i:'💊',tit:x.farmaco,sub:x.dose,data:x.inizio})),
    ...dati.problemi.filter(p=>has(p.titolo,p.descrizione,...(p.aggiornamenti||[]).map(a=>a.testo)))
      .map(p=>({id:'p'+p.id,tab:'diario',i:'📔',tit:p.titolo,sub:p.descrizione,data:p.data})),
    ...dati.esami.filter(e=>has(e.tipo,tv(e.tipo),e.struttura,e.esito,e.note))
      .map(e=>({id:'e'+e.id,tab:'esami',i:esameIcon(e.tipo),tit:tv(e.tipo),sub:e.struttura||e.esito,data:e.data})),
    ...dati.allergie.filter(a=>has(a.sostanza,a.tipo,tv(a.tipo),a.sintomi,a.note))
      .map(a=>({id:'al'+a.id,tab:'allergie',i:allergiaIcon(a.tipo),tit:a.sostanza,sub:`${tv(a.tipo)} · ${tv(a.gravita)}`,data:a.data})),
    ...dati.allenamenti.filter(a=>has(a.tipo,tv(a.tipo),a.note))
      .map(a=>({id:'s'+a.id,tab:'sport',i:'💪',tit:tv(a.tipo),sub:`${a.durata} min`,data:a.data})),
    ...dati.vitali.filter(v=>has(v.tipo,tv(v.tipo),v.note))
      .map(v=>({id:'w'+v.id,tab:'vitali',i:'💓',tit:tv(v.tipo),
        sub:v.note||(v.tipo==='Pressione'?`${v.massima}/${v.minima}`:`${v.valore} ${VITALI.find(x=>x.n===v.tipo)?.u||''}`),data:v.data})),
  ].sort((x,y)=>String(y.data).localeCompare(String(x.data)));

  return (
    <Modal title={t('search_title')} onClose={onClose}>
      <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder={t('search_ph')}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white mb-4"/>
      {query.length<2 ? (
        <p className="text-xs text-gray-300 text-center py-8">{t('search_hint')}</p>
      ) : risultati.length===0 ? (
        <div className="text-center py-10"><p className="text-4xl mb-2">🔍</p><p className="text-gray-400 text-sm">{t('search_none')}</p></div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-2">{t('search_count',risultati.length)}</p>
          {risultati.slice(0,50).map(r=>(
            <button key={r.id} onClick={()=>onGo(r.tab)} className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-3 text-left transition-colors">
              <span className="text-xl flex-shrink-0">{r.i}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-gray-800 truncate">{r.tit}</span>
                {r.sub&&<span className="block text-xs text-gray-400 truncate">{r.sub}</span>}
              </span>
              <span className="text-xs text-gray-300 flex-shrink-0">{fmt(r.data)}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AltroModal({onGo, onClose}) {
  const voci = [
    {id:'diario',i:'📔',c:'#fff7ed'},
    {id:'esami',i:'🩻',c:'#eef2ff'},
    {id:'allergie',i:'⚠️',c:'#fff1f2'},
    {id:'sport',i:'💪',c:'#f0fdf4'},
    {id:'ricette',i:'📋',c:'#ecfeff'},
    {id:'note',i:'📝',c:'#fffbeb'},
  ];
  return (
    <Modal title={t('more_title')} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {voci.map(v=>(
          <button key={v.id} onClick={()=>onGo(v.id)} className="rounded-2xl p-5 text-center active:scale-95 transition-transform" style={{background:v.c}}>
            <p className="text-3xl mb-2">{v.i}</p>
            <p className="text-sm font-bold text-gray-700">{tTab(v.id)}</p>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function BackupModal({onClose}) {
  const ref = useRef(null);
  const [conAllegati, setConAllegati] = useState(true);
  const [stato, setStato] = useState('idle');   // idle | work | fatto | errore
  const [msg, setMsg] = useState(null);
  const [daImportare, setDaImportare] = useState(null);

  const esporta = async () => {
    setStato('work'); setMsg(null);
    try {
      const { creaBackup } = await import('./backup');
      const { blob, nome } = await creaBackup({includiAllegati:conAllegati});
      try {
        const f = new File([blob], nome, {type:'application/json'});
        if (navigator.canShare?.({files:[f]})) { await navigator.share({files:[f], title:nome}); setStato('idle'); return; }
      } catch(e) { if (e?.name==='AbortError') { setStato('idle'); return; } }
      scaricaBlob(blob, nome);
      setStato('idle');
    } catch(e) { console.error(e); setStato('errore'); setMsg(t('bk_export_err')); }
  };

  const scegli = async e => {
    const file = e.target.files?.[0]; e.target.value='';
    if (!file) return;
    setStato('work'); setMsg(null);
    try {
      const { leggiBackup } = await import('./backup');
      setDaImportare(await leggiBackup(file));
      setStato('idle');
    } catch(err) {
      setStato('errore');
      setMsg(err.message==='versione' ? t('bk_too_new') : t('bk_bad_file'));
    }
  };

  const conferma = async () => {
    setStato('work');
    try {
      const { applicaBackup } = await import('./backup');
      await applicaBackup(daImportare.contenuto);
      setStato('fatto');
      setTimeout(()=>window.location.reload(), 1200);
    } catch(e) { console.error(e); setStato('errore'); setMsg(t('bk_import_err')); }
  };

  const R = daImportare?.riepilogo;

  return (
    <Modal title={t('bk_title')} onClose={onClose}>
      <input ref={ref} type="file" accept="application/json,.json" className="hidden" onChange={scegli}/>

      {stato==='fatto' ? (
        <div className="text-center py-10">
          <p className="text-5xl mb-3">✅</p>
          <p className="font-bold text-gray-800">{t('bk_done')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('bk_reloading')}</p>
        </div>
      ) : daImportare ? (
        <>
          <div className="rounded-2xl p-4 mb-4" style={{background:'#fffbeb',border:'1px solid #fde68a'}}>
            <p className="text-sm font-bold" style={{color:'#b45309'}}>⚠️ {t('bk_warn_title')}</p>
            <p className="text-xs text-gray-600 mt-1">{t('bk_warn')}</p>
          </div>
          <p className="text-xs text-gray-400 mb-2">{t('bk_file_of')} {daImportare.creato ? fmt(daImportare.creato.slice(0,10)) : '-'}</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[['👨‍⚕️',t('visits_title'),R.visite],['🩸',t('tests_title'),R.analisi],['💓',t('vitals_title'),R.vitali],
              ['💪',t('workouts_title'),R.allenamenti],['📋',t('rx_title'),R.ricette],['📝',t('notes_title'),R.note],
              ['💊',t('therapies_title'),R.terapie],['📔',t('diary_title'),R.problemi],['⚠️',t('allergies_title'),R.allergie],
              ['📎',t('bk_attachments'),R.allegati]].filter(x=>x[2]>0).map(([i,l,n])=>(
              <div key={l} className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-2">
                <span>{i}</span><span className="text-xs text-gray-500 flex-1 truncate">{l}</span>
                <span className="text-sm font-black text-gray-700">{n}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={()=>{setDaImportare(null);setMsg(null);}} className="flex-1 py-3 rounded-2xl text-sm font-bold bg-gray-100 text-gray-500">{t('cancel')}</button>
            <button onClick={conferma} disabled={stato==='work'} className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#b45309,#f59e0b)'}}>
              {stato==='work'?'⏳':t('bk_replace')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-4">{t('bk_desc')}</p>

          <label className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 mb-3 cursor-pointer">
            <input type="checkbox" checked={conAllegati} onChange={()=>setConAllegati(v=>!v)} className="w-4 h-4 accent-blue-600"/>
            <span className="flex-1">
              <span className="block text-sm font-bold text-gray-700">{t('bk_with_files')}</span>
              <span className="block text-xs text-gray-400">{t('bk_with_files_hint')}</span>
            </span>
          </label>

          <button onClick={esporta} disabled={stato==='work'}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-sm mb-2 disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
            {stato==='work'?'⏳':`💾 ${t('bk_export')}`}
          </button>
          <button onClick={()=>ref.current?.click()} disabled={stato==='work'}
            className="w-full py-3 rounded-2xl font-bold text-sm border-2 disabled:opacity-50"
            style={{borderColor:'#e5e7eb',color:'#6b7280'}}>
            📂 {t('bk_import')}
          </button>

          {msg&&<p className="text-xs text-red-500 text-center mt-3">{msg}</p>}
          <p className="text-xs text-gray-300 text-center mt-4">{t('bk_note')}</p>
        </>
      )}
    </Modal>
  );
}

function StatisticheModal({dati, onPremium, onClose}) {
  const bloccato = ACQUISTI_ATTIVI && !isPremium();
  const [mesi, setMesi] = useState(12);
  const [sel, setSel] = useState([]);          // parametri da confrontare (max 3)
  const COLORI = ['#be123c','#1e40af','#15803d'];
  const PERIODI = [{v:3,l:'st_3m'},{v:6,l:'st_6m'},{v:12,l:'st_12m'},{v:null,l:'pdf_all'}];

  const limite = mesi ? new Date(Date.now()-mesi*30*24*3600*1000).toISOString().slice(0,10) : '0000';
  const dentro = d => String(d) >= limite;

  // Serie di ogni parametro presente in almeno 2 analisi nel periodo
  const serie = {};
  dati.analisi.forEach(a=>(a.params||[]).forEach(p=>{
    const d = p.d||a.data;
    if (!dentro(d)) return;
    (serie[p.n] = serie[p.n] || []).push({data:d, v:p.v, p});
  }));
  const disponibili = Object.keys(serie).filter(n=>serie[n].length>=2).sort();
  Object.values(serie).forEach(s=>s.sort((x,y)=>String(x.data).localeCompare(String(y.data))));

  const flip = n => setSel(s=> s.includes(n) ? s.filter(x=>x!==n) : (s.length<3 ? [...s,n] : s));

  // Statistiche di un parametro
  const stat = n => {
    const s = serie[n]||[]; if(!s.length) return null;
    const vals = s.map(x=>x.v);
    const media = vals.reduce((a,b)=>a+b,0)/vals.length;
    const fuori = s.filter(x=>isAbn(x.p)).length;
    return {
      n, u:s[0].p.u, media, min:Math.min(...vals), max:Math.max(...vals),
      primo:vals[0], ultimo:vals[vals.length-1], n_mis:vals.length, fuori,
    };
  };

  // Dati per il grafico: un punto per data, una colonna per parametro selezionato
  const date = [...new Set(sel.flatMap(n=>serie[n].map(x=>x.data)))].sort();
  const grafico = date.map(d=>{
    const riga = {df:fmt(d)};
    sel.forEach(n=>{ const x=serie[n].find(y=>y.data===d); if(x) riga[n]=x.v; });
    return riga;
  });

  // Attività fisica nel periodo, per dare contesto
  const allen = dati.allenamenti.filter(a=>dentro(a.data));
  const minuti = allen.reduce((s,a)=>s+(a.durata||0),0);
  const pesi = dati.vitali.filter(v=>v.tipo==='Peso'&&dentro(v.data)).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
  const dPeso = pesi.length>1 ? pesi[pesi.length-1].valore - pesi[0].valore : null;

  if (bloccato) return (
    <Modal title={t('stats_title')} onClose={onClose} onSave={onPremium} saveLabel={`✨ ${t('stats_unlock')}`} saveBg="linear-gradient(135deg,#b45309,#f59e0b)">
      <div className="text-center py-6">
        <p className="text-5xl mb-3">📊</p>
        <p className="text-sm text-gray-500 px-4">{t('stats_locked')}</p>
      </div>
    </Modal>
  );

  return (
    <Modal title={t('stats_title')} onClose={onClose}>
      <div className="flex gap-2 mb-4">
        {PERIODI.map(p=>(
          <button key={String(p.v)} onClick={()=>setMesi(p.v)}
            className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all"
            style={mesi===p.v?{background:'#1e40af',color:'white',borderColor:'#1e40af'}:{background:'white',color:'#6b7280',borderColor:'#e5e7eb'}}>
            {t(p.l)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl p-3" style={{background:'#f0fdf4'}}>
          <p className="text-2xl font-black" style={{color:'#166534'}}>{allen.length}</p>
          <p className="text-xs text-gray-500">{t('st_workouts',minuti)}</p>
        </div>
        <div className="rounded-2xl p-3" style={{background:'#eff6ff'}}>
          <p className="text-2xl font-black" style={{color:'#1e40af'}}>{dPeso==null?'–':`${dPeso>0?'+':''}${Number(dPeso.toFixed(1))}`}</p>
          <p className="text-xs text-gray-500">{t('st_weight_change')}</p>
        </div>
      </div>

      {disponibili.length===0 ? (
        <div className="text-center py-10"><p className="text-4xl mb-2">📊</p><p className="text-sm text-gray-400 px-6">{t('stats_empty')}</p></div>
      ) : (
        <>
          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">{t('st_compare')}</p>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3" style={{scrollbarWidth:'none'}}>
            {disponibili.map(n=>{
              const i = sel.indexOf(n);
              return (
                <button key={n} onClick={()=>flip(n)} className="whitespace-nowrap text-xs px-3 py-1.5 rounded-full font-bold flex-shrink-0 border transition-all"
                  style={i>=0?{background:COLORI[i],color:'white',borderColor:COLORI[i]}:{background:'white',color:'#6b7280',borderColor:'#e5e7eb'}}>
                  {tv(n)}
                </button>
              );
            })}
          </div>

          {sel.length===0 ? (
            <p className="text-xs text-gray-300 text-center py-6">{t('st_pick')}</p>
          ) : (
            <>
              <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50 mb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={grafico} margin={{top:5,right:10,left:-25,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5"/>
                    <XAxis dataKey="df" tick={{fontSize:9,fill:'#9ca3af'}}/>
                    <YAxis tick={{fontSize:10,fill:'#9ca3af'}} width={45}/>
                    <Tooltip contentStyle={{fontSize:11,borderRadius:16,border:'none',boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}
                      formatter={(v,n)=>[v,tv(n)]}/>
                    {sel.map((n,i)=><Line key={n} type="monotone" dataKey={n} name={n} stroke={COLORI[i]} strokeWidth={2.5} connectNulls dot={{r:3}}/>)}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {sel.map((n,i)=>{
                  const s = stat(n); if(!s) return null;
                  const d = s.ultimo - s.primo;
                  return (
                    <div key={n} className="rounded-2xl p-3 border" style={{borderColor:'#f3f4f6'}}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{background:COLORI[i]}}/>
                        <p className="text-sm font-bold text-gray-800 flex-1">{tv(n)}</p>
                        <span className="text-xs font-bold" style={{color:d>0?'#f97316':d<0?'#0ea5e9':'#9ca3af'}}>
                          {d===0?'=':d>0?'↑':'↓'} {Math.abs(Number(d.toFixed(2)))}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        {[[t('st_avg'),s.media.toFixed(1)],[t('st_min'),s.min],[t('st_max'),s.max],[t('st_count'),s.n_mis]].map(([l,v])=>(
                          <div key={l}>
                            <p className="text-sm font-black text-gray-700">{v}</p>
                            <p className="text-xs text-gray-400">{l}</p>
                          </div>
                        ))}
                      </div>
                      {s.fuori>0&&<p className="text-xs mt-2" style={{color:'#be123c'}}>⚠ {t('st_out',s.fuori,s.n_mis)}</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      <p className="text-xs text-gray-300 text-center mt-4">{t('stats_note')}</p>
    </Modal>
  );
}

function RefertoModal({dati, onPremium, onClose}) {
  const SEZIONI = [
    {id:'dati', i:'🗂️', l:'pdf_personal'},
    {id:'allergie', i:'⚠️', l:'allergies_title'},
    {id:'terapie', i:'💊', l:'pdf_therapies'},
    {id:'analisi', i:'🩸', l:'tests_title'},
    {id:'visite', i:'👨‍⚕️', l:'visits_title'},
    {id:'vitali', i:'💓', l:'vitals_title'},
    {id:'percorsi', i:'📔', l:'pdf_journeys'},
  ];
  const PERIODI = [{v:6,l:'pdf_6m'},{v:12,l:'pdf_12m'},{v:null,l:'pdf_all'}];
  const [sez, setSez] = useState(new Set(SEZIONI.map(s=>s.id)));
  const [mesi, setMesi] = useState(12);
  const [stato, setStato] = useState('idle');
  const bloccato = ACQUISTI_ATTIVI && !isPremium();

  const flip = id => setSez(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });

  const genera = async () => {
    if (bloccato) { onPremium(); return; }
    setStato('work');
    try {
      const { generaReferto } = await import('./referto');
      const blob = await generaReferto(dati, {sezioni:sez, mesi});
      const nome = `referto_${new Date().toISOString().slice(0,10)}.pdf`;
      try {
        const f = new File([blob], nome, {type:'application/pdf'});
        if (navigator.canShare?.({files:[f]})) { await navigator.share({files:[f], title:nome}); setStato('idle'); return; }
      } catch(e) { if (e?.name==='AbortError') { setStato('idle'); return; } }
      scaricaBlob(blob, nome);
      setStato('idle');
    } catch(e) { console.error(e); setStato('errore'); }
  };

  return (
    <Modal title={t('pdf_modal_title')} onClose={onClose}>
      <p className="text-sm text-gray-400 mb-4">{t('pdf_modal_desc')}</p>

      <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">{t('pdf_sections')}</p>
      <div className="space-y-1.5 mb-4">
        {SEZIONI.map(s=>(
          <label key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={sez.has(s.id)} onChange={()=>flip(s.id)} className="w-4 h-4 accent-blue-600"/>
            <span className="text-lg">{s.i}</span>
            <span className="text-sm font-bold text-gray-700 flex-1">{t(s.l)}</span>
          </label>
        ))}
      </div>

      <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">{t('pdf_period')}</p>
      <div className="flex gap-2 mb-5">
        {PERIODI.map(p=>(
          <button key={String(p.v)} onClick={()=>setMesi(p.v)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
            style={mesi===p.v?{background:'#1e40af',color:'white',borderColor:'#1e40af'}:{background:'white',color:'#6b7280',borderColor:'#e5e7eb'}}>
            {t(p.l)}
          </button>
        ))}
      </div>

      <button onClick={genera} disabled={stato==='work'||sez.size===0}
        className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40"
        style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
        {stato==='work' ? '⏳' : bloccato ? `✨ ${t('pdf_unlock')}` : `📄 ${t('pdf_create')}`}
      </button>
      {stato==='errore'&&<p className="text-xs text-red-500 text-center mt-2">{t('pdf_error')}</p>}
      <p className="text-xs text-gray-300 text-center mt-3">{t('pdf_note')}</p>
    </Modal>
  );
}

function PremiumModal({onSbloccato, onClose}) {
  const [stato, setStato] = useState('idle');   // idle | work | ok | errore | niente
  const disponibile = acquistiDisponibili();
  const p = prezzo();

  const compra = async () => {
    setStato('work');
    const r = await acquista();
    if (r==='ok') { setStato('ok'); onSbloccato(); }
    else if (r==='annullato') setStato('idle');
    else setStato('errore');
  };
  const rip = async () => {
    setStato('work');
    const r = await ripristina();
    if (r==='ok') { setStato('ok'); onSbloccato(); }
    else if (r==='niente') setStato('niente');
    else setStato('errore');
  };

  return (
    <Modal title={t('premium_title')} onClose={onClose}>
      <div className="text-center py-4">
        <p className="text-5xl mb-3">✨</p>
        <p className="font-black text-gray-800 text-lg">{t('premium_name')}</p>
        <p className="text-sm text-gray-500 mt-2 px-4">{t('premium_desc',MAX_GRATIS,MAX_PREMIUM)}</p>
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{background:'#fffbeb'}}>
        {[t('premium_b1',MAX_PREMIUM), t('premium_b2'), t('premium_b3')].map((b,i)=>(
          <p key={i} className="text-sm text-gray-700 flex items-start gap-2 mb-1.5 last:mb-0">
            <span style={{color:'#b45309'}}>✓</span><span>{b}</span>
          </p>
        ))}
      </div>

      {stato==='ok' ? (
        <div className="text-center py-4">
          <p className="text-4xl mb-2">🎉</p>
          <p className="font-bold text-gray-800">{t('premium_ok')}</p>
        </div>
      ) : !disponibile ? (
        <p className="text-xs text-gray-400 text-center py-4">{t('premium_unavailable')}</p>
      ) : (
        <>
          <button onClick={compra} disabled={stato==='work'}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#b45309,#f59e0b)'}}>
            {stato==='work' ? '⏳' : (p ? t('premium_buy_price',p) : t('premium_buy'))}
          </button>
          <button onClick={rip} disabled={stato==='work'} className="w-full py-2.5 mt-2 text-xs font-bold text-gray-400">
            {t('premium_restore')}
          </button>
          {stato==='errore'&&<p className="text-xs text-red-500 text-center mt-2">{t('premium_error')}</p>}
          {stato==='niente'&&<p className="text-xs text-gray-400 text-center mt-2">{t('premium_none')}</p>}
        </>
      )}
      <p className="text-xs text-gray-300 text-center mt-4">{t('premium_note')}</p>
    </Modal>
  );
}

function SettingsModal({lang, onLang, promemoria, onPromemoria, blocco, onBlocco, onExport, onReferto, onStat, onBackup, onCartella, cartella, premium, onPremium, onClose}) {
  const [info, setInfo] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgB, setMsgB] = useState(null);
  const curLang = LANGS.find(l=>l.code===lang) || LANGS[0];
  const Row = ({icon,label,desc,onClick,open}) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 bg-gray-50 rounded-2xl p-4 mb-2 text-left active:bg-gray-100 hover:bg-gray-100 transition-colors">
      <span className="text-2xl">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-gray-800 text-sm">{label}</span>
        {desc&&<span className="block text-xs text-gray-400">{desc}</span>}
      </span>
      <span className="text-gray-300 text-lg">{open?'▾':'›'}</span>
    </button>
  );
  return (
    <Modal title={t('set_title')} onClose={onClose}>
      <Row icon="🗂️" label={t('record_title')}
        desc={cartella?.gruppo || cartella?.altezza || cartella?.peso
          ? [cartella.gruppo, cartella.altezza&&`${cartella.altezza} cm`, cartella.peso&&`${cartella.peso} kg`].filter(Boolean).join(' · ')
          : t('record_empty')}
        onClick={onCartella}/>
      <div className="w-full flex items-center gap-3 bg-gray-50 rounded-2xl p-4 mb-2">
        <span className="text-2xl">🔒</span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-gray-800 text-sm">{t('lock_title')}</span>
          <span className="block text-xs text-gray-400">{t('lock_desc')}</span>
        </span>
        <button onClick={async()=>{ const r=await onBlocco(!blocco); setMsgB(r); }}
          className="w-12 h-7 rounded-full flex-shrink-0 transition-colors relative"
          style={{background:blocco?'#1e40af':'#d1d5db'}}>
          <span className="absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all" style={{left:blocco?'26px':'4px'}}/>
        </button>
      </div>
      {msgB&&<p className="text-xs text-gray-400 px-2 -mt-1 mb-2">{msgB}</p>}
      <div className="w-full flex items-center gap-3 bg-gray-50 rounded-2xl p-4 mb-2">
        <span className="text-2xl">🔔</span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-gray-800 text-sm">{t('set_notif')}</span>
          <span className="block text-xs text-gray-400">{t('set_notif_d')}</span>
        </span>
        <button onClick={async()=>{ const r=await onPromemoria(!promemoria); setMsg(r); }}
          className="w-12 h-7 rounded-full flex-shrink-0 transition-colors relative"
          style={{background:promemoria?'#1e40af':'#d1d5db'}}>
          <span className="absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all" style={{left:promemoria?'26px':'4px'}}/>
        </button>
      </div>
      {msg&&<p className="text-xs text-gray-400 px-2 -mt-1 mb-2">{msg}</p>}
      <Row icon="💾" label={t('bk_title')} desc={t('bk_row_desc')} onClick={onBackup}/>
      <Row icon="📊" label={t('stats_title')} desc={t('stats_row_desc')} onClick={onStat}/>
      <Row icon="📄" label={t('pdf_modal_title')} desc={t('pdf_row_desc')} onClick={onReferto}/>
      <Row icon="📥" label={t('set_export')} desc={t('set_export_d')} onClick={onExport}/>
      <Row icon="🌐" label={t('set_lang')} desc={`${curLang.flag} ${curLang.label}`} onClick={()=>setLangOpen(v=>!v)} open={langOpen}/>
      {langOpen&&(
        <div className="rounded-2xl p-2 mb-2 space-y-1" style={{background:'#eff6ff'}}>
          {LANGS.map(l=>(
            <button key={l.code} onClick={()=>{onLang(l.code); setLangOpen(false);}}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
              style={l.code===lang?{background:'#1e40af',color:'white'}:{background:'transparent',color:'#374151'}}>
              <span className="text-xl">{l.flag}</span>
              <span className="text-sm font-bold flex-1">{l.label}</span>
              {l.code===lang&&<span className="text-sm">✓</span>}
            </button>
          ))}
        </div>
      )}
      {ACQUISTI_ATTIVI&&<Row icon="✨" label={t('premium_name')}
        desc={premium ? t('premium_active') : t('premium_row_desc',MAX_PREMIUM)}
        onClick={onPremium}/>}
      <Row icon="ℹ️" label={t('set_info')} desc={t('version_n',APP_VERSION)} onClick={()=>setInfo(v=>!v)} open={info}/>
      {info&&(
        <div className="rounded-2xl p-4 text-xs text-gray-500 leading-relaxed" style={{background:'#eff6ff'}}>
          <p className="font-bold text-gray-700 mb-1">🏥 HealthTracker {APP_VERSION}</p>
          <p>{t('info_text')}</p>
          <p className="mt-2">{t('icon_credit')}</p>
        </div>
      )}
    </Modal>
  );
}

function ExportModal({visite,analisi,vitali,onClose}) {
  const [errore, setErrore] = useState(null);

  const fileVisite = () => {
    const h=[t('h_date'),t('h_doctor'),t('h_spec'),t('h_diag'),t('h_cost'),t('h_notes'),t('h_nfiles')];
    const r=visite.map(v=>[fmt(v.data),v.medico,tv(v.spec),v.diagnosi||'',v.costo??'',v.note||'',(v.allegati||[]).length]);
    return {name:'visite_mediche.csv', content:mkCSV(h,r)};
  };
  const fileAnalisi = () => {
    const h=[t('h_date'),t('h_param'),t('h_value'),t('h_unit'),t('h_refmin'),t('h_refmax'),t('h_abn'),t('h_notes')];
    const r=[];
    analisi.forEach(a=>(a.params||[]).forEach(p=>r.push([fmt(p.d||a.data),tv(p.n),p.v,p.u,p.min??'',p.max??'',isAbn(p)?t('yes'):t('no'),a.note||''])));
    return {name:'analisi_sangue.csv', content:mkCSV(h,r)};
  };
  const fileVitali = () => {
    const h=[t('h_date'),t('h_type'),t('h_value'),t('h_unit'),t('h_notes')];
    const r=vitali.map(v=>[fmt(v.data),tv(v.tipo),v.tipo==='Pressione'?`${v.massima??''}/${v.minima??''}`:v.valore,VITALI.find(x=>x.n===v.tipo)?.u||'',v.note||'']);
    return {name:'dati_vitali.csv', content:mkCSV(h,r)};
  };

  const esporta = async fn => {
    setErrore(null);
    try { const f=fn(); await salvaCSV(f.name, f.content); }
    catch(e) { console.error(e); setErrore(t('export_err')); }
  };
  const expAll = async () => {
    setErrore(null);
    try {
      const elenco=[];
      if (visite.length) elenco.push(fileVisite());
      if (analisi.length) elenco.push(fileAnalisi());
      if (vitali.length) elenco.push(fileVitali());
      await salvaCSVMulti(elenco);
    } catch(e) { console.error(e); setErrore(t('export_err')); }
  };

  const items=[
    {l:`👨‍⚕️ ${t('visits_title')}`,c:visite.length,f:()=>esporta(fileVisite),bg:'#eff6ff',col:'#1e40af'},
    {l:`🩸 ${t('tests_title')}`,c:analisi.length,f:()=>esporta(fileAnalisi),bg:'#fff1f2',col:'#be123c'},
    {l:`💓 ${t('vitals_title')}`,c:vitali.length,f:()=>esporta(fileVitali),bg:'#fdf4ff',col:'#7e22ce'},
  ];
  const tot=visite.length+analisi.length+vitali.length;
  return (
    <Modal title={t('export_title')} onClose={onClose}>
      <p className="text-sm text-gray-400 mb-5">{t('export_desc')}</p>
      <div className="space-y-3 mb-4">
        {items.map(it=>(
          <button key={it.l} onClick={it.c>0?it.f:undefined} disabled={it.c===0}
            className="w-full flex items-center justify-between px-4 py-4 rounded-2xl transition-all hover:opacity-80 disabled:opacity-35 disabled:cursor-not-allowed text-left"
            style={{background:it.bg}}>
            <div>
              <p className="font-bold text-sm" style={{color:it.col}}>{it.l}</p>
              <p className="text-xs mt-0.5" style={{color:it.col,opacity:.6}}>{t('records_n',it.c)}</p>
            </div>
            <span className="text-xl">📤</span>
          </button>
        ))}
      </div>
      <button onClick={expAll} disabled={tot===0}
        className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40"
        style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
        {t('export_all')}
      </button>
      {errore&&<p className="text-xs text-red-500 text-center mt-3">{errore}</p>}
      <p className="text-xs text-gray-300 text-center mt-3">{t('export_note')}</p>
    </Modal>
  );
}

// --- Views ---
function Dashboard({visite, analisi, vitali, terapie, problemi, ricette, note, allergie, allenamenti, cartella, onGo, onNuovo, onApri}) {
  const oggiD = new Date();
  const oggi = oggiD.toISOString().slice(0,10);
  const giorni = d => Math.round((new Date(d) - new Date(oggi)) / 86400000);
  const ora = oggiD.getHours()*60 + oggiD.getMinutes();

  const lv=visite.find(v=>v.data<oggi), la=analisi[0];
  const abn=(la?.params||[]).filter(isAbn).length;
  const lp=vitali.find(v=>v.tipo==='Peso'), lfc=vitali.find(v=>v.tipo==='Frequenza cardiaca');
  const prossime = visite.filter(v=>v.data>=oggi).sort((a,b)=>a.data.localeCompare(b.data)).slice(0,3);
  const percorsi = problemi.filter(p=>p.stato!=='risolto');
  const daUsare = (ricette||[]).filter(r=>!r.usata);
  const vuoto = ![visite, analisi, vitali, terapie, problemi, ricette, note, allergie, allenamenti]
    .some(x => (x||[]).length > 0);

  // Farmaci di oggi, con quelli già passati marcati
  const dosiOggi = terapie
    .filter(x=>x.promemoria && x.orari?.length && (!x.fine || x.fine>=oggi) && (!x.inizio || x.inizio<=oggi))
    .flatMap(x=>x.orari.map(o=>{ const [h,m]=String(o).split(':').map(Number); return {x, o, min:h*60+m}; }))
    .sort((a,b)=>a.min-b.min);

  const saluto = ora<300 ? 'greet_night' : ora<720 ? 'greet_morning' : ora<1080 ? 'greet_afternoon' : 'greet_evening';

  const AZIONI = [
    {id:'visita',   i:'👨‍⚕️', l:'visits_title',   c:'#eff6ff'},
    {id:'analisi',  i:'🩸',   l:'tests_title',    c:'#fff1f2'},
    {id:'vitale',   i:'💓',   l:'vitals_title',   c:'#fdf4ff'},
    {id:'nota',     i:'📝',   l:'notes_title',    c:'#fffbeb'},
    {id:'allenamento', i:'💪', l:'workouts_title', c:'#f0fdf4'},
  ];

  const Riquadro = ({v,l,bg,c,i,tab}) => (
    <button onClick={()=>onGo(tab)} className="rounded-2xl p-4 text-left active:scale-95 transition-transform" style={{background:bg}}>
      <div className="text-xl mb-1">{i}</div>
      <div className="text-3xl font-black" style={{color:c}}>{v}</div>
      <div className="text-xs font-semibold mt-0.5" style={{color:c,opacity:.7}}>{l}</div>
    </button>
  );

  return (
    <div>
      <div className="mb-4">
        <p className="text-lg font-black text-gray-800">
          {cartella?.nome ? t(saluto+'_name', String(cartella.nome).split(' ')[0]) : t(saluto)}
        </p>
        <p className="text-xs text-gray-400">{oggiD.toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'})}</p>
      </div>

      {/* Azioni rapide */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5" style={{scrollbarWidth:'none'}}>
        {AZIONI.map(a=>(
          <button key={a.id} onClick={()=>onNuovo(a.id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-gray-700 active:scale-95 transition-transform"
            style={{background:a.c}}>
            <span className="text-base">{a.i}</span> + {t(a.l)}
          </button>
        ))}
      </div>

      {vuoto ? (
        <div className="text-center py-14">
          <p className="text-6xl mb-4">🏥</p>
          <p className="text-gray-400 font-semibold">{t('empty_title')}</p>
          <p className="text-gray-300 text-sm mt-1 px-8">{t('home_empty_sub')}</p>
        </div>
      ) : (
        <>
          {/* Farmaci di oggi */}
          {dosiOggi.length>0&&(
            <div className="rounded-2xl p-4 mb-4" style={{background:'#f0fdfa'}}>
              <p className="text-xs font-black uppercase tracking-wider mb-2" style={{color:'#0f766e'}}>💊 {t('home_today_meds')}</p>
              <div className="space-y-1.5">
                {dosiOggi.map((d,i)=>{
                  const passato = d.min <= ora;
                  return (
                    <button key={i} onClick={()=>onGo('diario')} className={`w-full flex items-center gap-2 bg-white/70 rounded-xl px-3 py-2 text-left ${passato?'opacity-50':''}`}>
                      <span className="text-sm font-black" style={{color:'#0f766e'}}>{d.o}</span>
                      <span className="text-sm text-gray-700 flex-1 truncate">{d.x.farmaco}</span>
                      {d.x.dose&&<span className="text-xs text-gray-400">{d.x.dose}</span>}
                      {passato&&<span className="text-xs text-gray-300">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ricette ancora da utilizzare */}
          {daUsare.length>0&&(
            <button onClick={()=>onGo('ricette')} className="w-full rounded-2xl p-4 mb-4 text-left flex items-center gap-3" style={{background:'#ecfeff'}}>
              <span className="text-2xl">📋</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold" style={{color:'#0e7490'}}>{t('home_rx',daUsare.length)}</span>
                <span className="block text-xs text-gray-500 truncate">{daUsare.slice(0,2).map(r=>r.descrizione).join(' · ')}</span>
              </span>
              <span className="text-gray-300">›</span>
            </button>
          )}

          {/* Prossime visite */}
          {prossime.length>0&&(
            <div className="mb-4">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">📅 {t('home_next')}</p>
              <div className="space-y-2">
                {prossime.map(v=>{
                  const g = giorni(v.data);
                  return (
                    <button key={v.id} onClick={()=>onApri('visita',v)} className="w-full bg-white rounded-2xl p-3.5 shadow-sm border border-gray-50 flex items-center gap-3 text-left hover:shadow-md transition-all" style={{borderLeft:'3px solid #3b82f6'}}>
                      <span className="rounded-xl px-2.5 py-1.5 text-center flex-shrink-0" style={{background:'#eff6ff'}}>
                        <span className="block text-sm font-black" style={{color:'#1e40af'}}>{g===0?t('home_today'):g===1?t('home_tomorrow'):`${g}`}</span>
                        {g>1&&<span className="block text-xs" style={{color:'#1e40af',opacity:.6}}>{t('home_days')}</span>}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-gray-800 truncate">Dr. {v.medico}</span>
                        <span className="block text-xs text-gray-400 truncate">{tv(v.spec)} · {fmt(v.data)}</span>
                      </span>
                      <span className="text-gray-300">›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Riquadri riepilogo */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Riquadro v={visite.length} l={t('stat_visite')} bg="#eff6ff" c="#1e40af" i="👨‍⚕️" tab="visite"/>
            <Riquadro v={analisi.length} l={t('stat_analisi')} bg="#fff1f2" c="#be123c" i="🩸" tab="analisi"/>
            <Riquadro v={vitali.length} l={t('stat_mis')} bg="#fdf4ff" c="#7e22ce" i="💓" tab="vitali"/>
            <Riquadro v={abn} l={abn>0?t('stat_anom'):t('stat_ok')} bg={abn>0?'#fffbeb':'#f0fdf4'} c={abn>0?'#92400e':'#166534'} i={abn>0?'⚠️':'✅'} tab="analisi"/>
          </div>

          {/* Percorsi aperti */}
          {percorsi.length>0&&(
            <div className="mb-5">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">📔 {t('home_journeys',percorsi.length)}</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:'none'}}>
                {percorsi.map(p=>(
                  <button key={p.id} onClick={()=>onApri('percorso',p)}
                    className="flex-shrink-0 rounded-2xl px-4 py-3 text-left max-w-[70%]" style={{background:'#fff7ed'}}>
                    <p className="text-sm font-bold text-gray-800 truncate">{p.titolo}</p>
                    <p className="text-xs text-gray-400">{t('since')} {fmt(p.data)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Aggiornamenti recenti */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('recent')}</p>
          <div className="space-y-3">
            {lv&&(
              <button onClick={()=>onApri('visita',lv)} className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-50 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'#eff6ff',color:'#1e40af'}}>{tv(lv.spec)}</span>
                  {lv.allegati?.length>0&&<span className="text-xs text-blue-300">📎 {lv.allegati.length}</span>}
                  <span className="ml-auto text-xs text-gray-400">{fmt(lv.data)}</span>
                </div>
                <p className="font-bold text-gray-800 text-sm">Dr. {lv.medico}</p>
                {lv.diagnosi&&<p className="text-xs text-gray-500 mt-0.5">{lv.diagnosi}</p>}
              </button>
            )}
            {la&&(
              <button onClick={()=>onApri('analisi',la)} className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-50 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'#fff1f2',color:'#be123c'}}>{t('last_test')}</span>
                  {la.allegati?.length>0&&<span className="text-xs text-blue-300">📎 {la.allegati.length}</span>}
                  <span className="ml-auto text-xs text-gray-400">{fmt(la.data)}</span>
                </div>
                <p className="font-bold text-gray-800 text-sm">{t('params_n',(la.params||[]).length)}</p>
                <p className={`text-xs mt-0.5 ${abn>0?'text-red-500':'text-green-500'}`}>{abn>0?t('out_range',abn):t('all_ok')}</p>
              </button>
            )}
            {(lp||lfc)&&(
              <button onClick={()=>onGo('vitali')} className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-50 hover:shadow-md transition-all">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('last_vitals')}</p>
                <div className="flex gap-5">
                  {lp&&<div><p className="text-2xl font-black text-blue-600">{lp.valore} <span className="text-sm font-normal text-gray-400">kg</span></p><p className="text-xs text-gray-400">{tv('Peso')} · {fmt(lp.data)}</p></div>}
                  {lfc&&<div><p className="text-2xl font-black text-pink-500">{lfc.valore} <span className="text-sm font-normal text-gray-400">bpm</span></p><p className="text-xs text-gray-400">{t('hr_short')} · {fmt(lfc.data)}</p></div>}
                </div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function VisitaCard({v, onDel, onView, futura}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:shadow-md transition-all" style={futura?{borderLeft:'3px solid #3b82f6'}:undefined} onClick={()=>onView(v)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'#eff6ff',color:'#1e40af'}}>{tv(v.spec)}</span>
            <span className="text-xs text-gray-400">{fmt(v.data)}</span>
            {v.costo!=null&&v.costo!==''&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#f0fdf4',color:'#166534'}}>{eur(v.costo)}</span>}
            {v.allegati?.length>0&&<span className="text-xs text-blue-400 font-medium">📎 {v.allegati.length}</span>}
          </div>
          <p className="font-bold text-gray-800">Dr. {v.medico}</p>
          {v.diagnosi&&<p className="text-sm text-gray-500 mt-0.5 truncate">{v.diagnosi}</p>}
          <p className="text-xs text-gray-300 mt-1">{t('tap_details')}</p>
        </div>
        <button onClick={e=>{e.stopPropagation();onDel(v.id)}} className="text-gray-200 hover:text-red-400 transition-colors text-xl ml-3 mt-0.5 flex-shrink-0">🗑</button>
      </div>
    </div>
  );
}

function Visite({visite, onAdd, onDel, onView}) {
  const d = new Date();
  const oggi = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const daFare = visite.filter(v=>v.data>=oggi).slice().sort((a,b)=>a.data.localeCompare(b.data));
  const fatte = visite.filter(v=>v.data<oggi);
  const speso = visite.reduce((s,v)=>s+(Number(v.costo)||0),0);
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('visits_title')}</h2><p className="text-xs text-gray-400">{t('visits_count',visite.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#1e40af,#3b82f6)'}}>{t('new_f')}</button>
      </div>
      {speso>0&&(
        <div className="rounded-2xl p-3 mb-4 flex items-center justify-between" style={{background:'#f0fdf4'}}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{color:'#166534'}}>{t('total_spent')}</p>
          <p className="font-black" style={{color:'#166534'}}>{eur(speso)}</p>
        </div>
      )}
      {visite.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">👨‍⚕️</p><p className="text-gray-400">{t('no_visits')}</p></div>
      ):(
        <div>
          {daFare.length>0&&(
            <div className="mb-6">
              <p className="text-xs font-black text-blue-600 uppercase tracking-wider mb-2">{t('todo_s',daFare.length)}</p>
              <div className="space-y-3">
                {daFare.map(v=><VisitaCard key={v.id} v={v} onDel={onDel} onView={onView} futura/>)}
              </div>
            </div>
          )}
          {fatte.length>0&&(
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">{t('done_s',fatte.length)}</p>
              <div className="space-y-3">
                {fatte.map(v=><VisitaCard key={v.id} v={v} onDel={onDel} onView={onView}/>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AndamentoAnalisi({analisi}) {
  // Parametri presenti in almeno 2 analisi: solo per quelli ha senso un andamento
  const conteggi = {};
  analisi.forEach(a=>(a.params||[]).forEach(p=>{ conteggi[p.n]=(conteggi[p.n]||0)+1; }));
  const disponibili = Object.keys(conteggi).filter(n=>conteggi[n]>=2).sort();
  const [sel, setSel] = useState(disponibili[0]||'');
  if (disponibili.length===0) return null;
  const attivo = disponibili.includes(sel) ? sel : disponibili[0];
  // I riferimenti sono salvati dentro ogni valore, così valgono anche per i parametri personalizzati
  const def = PARAMS.find(p=>p.n===attivo) || analisi.flatMap(a=>a.params||[]).find(p=>p.n===attivo) || {};

  const punti = analisi
    .map(a=>{ const p=(a.params||[]).find(x=>x.n===attivo); const d=p?.d||a.data; return p?{data:d,df:fmt(d),val:p.v,fuori:isAbn(p)}:null; })
    .filter(Boolean)
    .sort((x,y)=>x.data.localeCompare(y.data));

  const primo = punti[0]?.val, ultimo = punti[punti.length-1]?.val;
  const delta = ultimo - primo;
  const segno = Math.abs(delta) < 0.001 ? '=' : (delta>0 ? '↑' : '↓');
  const fuoriN = punti.filter(p=>p.fuori).length;
  const lo = def?.min ?? null;
  const hi = (def?.max===null||def?.max===undefined) ? null : def.max;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 mb-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-black text-gray-400 uppercase tracking-wider">{t('trend_title')}</p>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:fuoriN?'#fff1f2':'#f0fdf4',color:fuoriN?'#be123c':'#166534'}}>
          {segno} {Math.abs(delta).toFixed(delta%1?1:0)} {def?.u}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3" style={{scrollbarWidth:'none'}}>
        {disponibili.map(n=>(
          <button key={n} onClick={()=>setSel(n)} className="whitespace-nowrap text-xs px-3 py-1.5 rounded-full font-bold flex-shrink-0 border transition-all"
            style={attivo===n?{background:'#be123c',color:'white',borderColor:'#be123c'}:{background:'white',color:'#6b7280',borderColor:'#e5e7eb'}}>
            {tv(n)}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={punti} margin={{top:5,right:10,left:-25,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5"/>
          {lo!==null&&hi!==null&&<ReferenceArea y1={lo} y2={hi} fill="#22c55e" fillOpacity={0.07}/>}
          <XAxis dataKey="df" tick={{fontSize:9,fill:'#9ca3af'}}/>
          <YAxis tick={{fontSize:10,fill:'#9ca3af'}} width={45} domain={['auto','auto']}/>
          <Tooltip formatter={v=>[`${v} ${def?.u}`,tv(attivo)]} contentStyle={{fontSize:11,borderRadius:16,border:'none',boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}/>
          <Line type="monotone" dataKey="val" stroke="#be123c" strokeWidth={2.5}
            dot={({cx,cy,payload})=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={payload.fuori?'#ef4444':'#be123c'}/>}
            activeDot={{r:6}}/>
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2">
        {refRange(def)!==null ? `${t('ref')} ${refRange(def)} ${def.u}` : ''}
        {fuoriN>0 && <span className="text-red-400"> · {t('trend_out',fuoriN)}</span>}
      </p>
    </div>
  );
}

function AnalisiView({analisi, onAdd, onDel, onView}) {
  const [vista, setVista] = useState('valori');   // valori = elenco completo · analisi = raggruppate per data
  const [filtro, setFiltro] = useState('');

  const [aperti, setAperti] = useState(new Set());
  const flip = n => setAperti(s=>{ const x=new Set(s); x.has(n)?x.delete(n):x.add(n); return x; });

  // Tutti i valori di tutte le analisi, ognuno con la sua data
  const tutti = analisi.flatMap(a=>(a.params||[]).map(p=>({p, a, data:p.d||a.data})))
    .sort((x,y)=>String(y.data).localeCompare(String(x.data)));

  // Un parametro = una voce, col valore più recente in evidenza e lo storico dentro
  const perParametro = [];
  const indice = new Map();
  for (const x of tutti) {                    // tutti è già ordinato dal più recente
    if (!indice.has(x.p.n)) { const g={nome:x.p.n, ultimo:x, storico:[]}; indice.set(x.p.n,g); perParametro.push(g); }
    else indice.get(x.p.n).storico.push(x);
  }
  const q = filtro.trim().toLowerCase();
  const visibili = q ? perParametro.filter(g=>tv(g.nome).toLowerCase().includes(q)||g.nome.toLowerCase().includes(q)) : perParametro;
  const anomali = perParametro.filter(g=>isAbn(g.ultimo.p)).length;

  const Tab = ({id,label}) => (
    <button onClick={()=>setVista(id)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
      style={vista===id?{background:'#be123c',color:'white'}:{background:'transparent',color:'#9ca3af'}}>{label}</button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black text-gray-800">{t('tests_title')}</h2>
          <p className="text-xs text-gray-400">{t('values_count',tutti.length,analisi.length)}</p>
        </div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#be123c,#f43f5e)'}}>{t('new_f')}</button>
      </div>

      {analisi.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">🩸</p><p className="text-gray-400">{t('no_tests')}</p></div>
      ):(
        <>
          {analisi.length>1 && <AndamentoAnalisi analisi={analisi}/>}

          <div className="flex gap-1 p-1 rounded-2xl bg-gray-100 mb-3">
            <Tab id="valori" label={t('view_values')}/>
            <Tab id="analisi" label={t('view_tests')}/>
          </div>

          {vista==='valori' ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder={t('filter_param')}
                  className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white"/>
                {filtro&&<button onClick={()=>setFiltro('')} className="text-gray-300 font-bold text-lg px-1">×</button>}
              </div>
              {anomali>0&&!q&&<p className="text-xs mb-2" style={{color:'#be123c'}}>⚠ {t('abn_total',anomali)}</p>}

              {visibili.length===0
                ? <div className="text-center py-10"><p className="text-4xl mb-2">🔍</p><p className="text-sm text-gray-400">{t('search_none')}</p></div>
                : <div className="space-y-1.5">
                    {visibili.map(g=>{
                      const x = g.ultimo, ab = isAbn(x.p);
                      const n = g.storico.length + 1;
                      const aperto = aperti.has(g.nome);
                      const prec = g.storico[0];
                      const delta = prec ? x.p.v - prec.p.v : null;
                      return (
                        <div key={g.nome} className="rounded-xl border overflow-hidden"
                          style={ab?{background:'#fff1f2',borderColor:'#fecdd3'}:{background:'white',borderColor:'#f3f4f6'}}>
                          <button onClick={()=>n>1?flip(g.nome):onView(x.a)}
                            className="w-full flex items-center gap-3 px-3 py-3 text-left">
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm font-bold ${ab?'text-red-700':'text-gray-800'}`}>{tv(g.nome)}</span>
                                {n>1&&<span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">×{n}</span>}
                              </span>
                              <span className="block text-xs text-gray-400 mt-0.5">
                                {fmt(x.data)}{refRange(x.p)!==null?` · ${t('ref')} ${refRange(x.p)}`:''}
                              </span>
                            </span>
                            {delta!=null&&Math.abs(delta)>0.0001&&(
                              <span className="text-xs font-bold flex-shrink-0" style={{color:delta>0?'#f97316':'#0ea5e9'}}>
                                {delta>0?'↑':'↓'}{Math.abs(Number(delta.toFixed(2)))}
                              </span>
                            )}
                            {ab&&<span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{background:'#ef4444'}}>!</span>}
                            <span className="text-right flex-shrink-0">
                              <span className={`block font-black text-base ${ab?'text-red-600':'text-gray-800'}`}>{x.p.v}</span>
                              <span className="block text-xs text-gray-400">{x.p.u}</span>
                            </span>
                            {n>1&&<span className="text-gray-300 text-sm flex-shrink-0">{aperto?'▾':'›'}</span>}
                          </button>

                          {aperto&&(
                            <div className="px-3 pb-3">
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">{t('history')}</p>
                              <div className="space-y-1">
                                {[x, ...g.storico].map((h,i)=>{
                                  const hab = isAbn(h.p);
                                  return (
                                    <button key={`${h.a.id}-${i}`} onClick={()=>onView(h.a)}
                                      className="w-full flex items-center gap-2 bg-white/70 rounded-lg px-2.5 py-2 text-left hover:bg-white transition-colors">
                                      <span className="text-xs text-gray-400 flex-1">{fmt(h.data)}{i===0?` · ${t('latest')}`:''}</span>
                                      <span className={`text-sm font-bold ${hab?'text-red-600':'text-gray-700'}`}>{h.p.v}</span>
                                      <span className="text-xs text-gray-400">{h.p.u}</span>
                                      <span className="text-gray-300 text-xs">›</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>}
            </>
          ) : (
            <div className="space-y-3">
              {analisi.map(a=>{
                const params=a.params||[], abn=params.filter(isAbn);
                return (
                  <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:shadow-md transition-all" onClick={()=>onView(a)}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="font-bold text-gray-800">{fmt(a.data)}</span>
                          {abn.length>0?<span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{background:'#fff1f2',color:'#be123c'}}>{t('abn_badge',abn.length)}</span>:<span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{background:'#f0fdf4',color:'#166534'}}>{t('ok_badge')}</span>}
                          {a.allegati?.length>0&&<span className="text-xs text-blue-400 font-medium">📎 {a.allegati.length}</span>}
                        </div>
                        <p className="text-xs text-gray-400">{t('params_tap',params.length)}</p>
                        {abn.length>0&&<p className="text-xs text-red-400 mt-1 truncate">↑↓ {abn.map(p=>tv(p.n)).join(', ')}</p>}
                      </div>
                      <button onClick={e=>{e.stopPropagation();onDel(a.id)}} className="text-gray-200 hover:text-red-400 transition-colors text-xl ml-3 flex-shrink-0">🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VitaliView({vitali, onAdd, onEdit, onDel}) {
  const [sel, setSel] = useState('Peso');
  const ti = VITALI.find(v=>v.n===sel);
  const dati = vitali.filter(v=>v.tipo===sel).slice().sort((a,b)=>a.data.localeCompare(b.data)).map(v=>({...v,df:fmt(v.data),val:parseFloat(v.valore)}));
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-lg font-black text-gray-800">{t('vitals_title')}</h2><p className="text-xs text-gray-400">{t('vitals_count',vitali.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#7e22ce,#a855f7)'}}>{t('add_btn')}</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{scrollbarWidth:'none'}}>
        {VITALI.map(v=>(
          <button key={v.n} onClick={()=>setSel(v.n)} className="whitespace-nowrap text-xs px-3.5 py-2 rounded-full font-bold flex-shrink-0 transition-all border"
            style={sel===v.n?{background:v.c,color:'white',borderColor:v.c}:{background:'white',color:'#6b7280',borderColor:'#e5e7eb'}}>
            {tv(v.n)}
          </button>
        ))}
      </div>
      {dati.length>1&&(
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{tv(sel)} ({ti?.u})</p>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={dati} margin={{top:5,right:10,left:-25,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5"/>
              <XAxis dataKey="df" tick={{fontSize:10,fill:'#9ca3af'}}/>
              <YAxis tick={{fontSize:10,fill:'#9ca3af'}} width={45}/>
              <Tooltip formatter={(v,name)=>[`${v} ${ti?.u}`, sel==='Pressione'?(name==='massima'?t('max_s'):t('min_s')):tv(sel)]} contentStyle={{fontSize:11,borderRadius:16,border:'none',boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}/>
              {sel==='Pressione' ? (
                <>
                  <Line type="monotone" dataKey="massima" stroke="#ef4444" strokeWidth={2.5} dot={{r:4,fill:'#ef4444',strokeWidth:0}} activeDot={{r:6}}/>
                  <Line type="monotone" dataKey="minima" stroke="#f97316" strokeWidth={2.5} dot={{r:4,fill:'#f97316',strokeWidth:0}} activeDot={{r:6}}/>
                </>
              ) : (
                <Line type="monotone" dataKey="val" stroke={ti?.c} strokeWidth={2.5} dot={{r:4,fill:ti?.c,strokeWidth:0}} activeDot={{r:6}}/>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {dati.length>0?(
        <div className="space-y-2">
          {[...dati].reverse().map(v=>(
            <div key={v.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-50">
              <div className="flex items-center">
                <span className="text-xs text-gray-400 flex-1">{v.df}</span>
                <span className="font-black text-gray-800">{sel==='Pressione'?`${v.massima??'-'}/${v.minima??'-'}`:v.valore}</span>
                <span className="text-xs text-gray-400 ml-1 mr-3">{ti?.u}</span>
                <button onClick={()=>onEdit(v)} title={t('edit')} className="text-gray-300 hover:text-blue-500 transition-colors mr-2">✏️</button>
                <button onClick={()=>onDel(v.id)} className="text-gray-200 hover:text-red-400 transition-colors">🗑</button>
              </div>
              {v.note&&<p className="text-xs text-gray-400 mt-1 pr-8">{v.note}</p>}
            </div>
          ))}
        </div>
      ):(
        <div className="text-center py-12"><p className="text-4xl mb-3">📈</p><p className="text-gray-400">{t('no_data_for',tv(sel))}</p></div>
      )}
    </div>
  );
}

// --- Main App ---
export default function App() {
  const [tab, setTab] = useState('home');
  const [visite, setVisite] = useState([]);
  const [analisi, setAnalisi] = useState([]);
  const [vitali, setVitali] = useState([]);
  const [allenamenti, setAllenamenti] = useState([]);
  const [ricette, setRicette] = useState([]);
  const [note, setNote] = useState([]);
  const [terapie, setTerapie] = useState([]);
  const [problemi, setProblemi] = useState([]);
  const [allergie, setAllergie] = useState([]);
  const [esami, setEsami] = useState([]);
  const [cartella, setCartella] = useState(null);
  const [premium, setPremiumState] = useState(false);
  const [blocco, setBlocco] = useState(false);             // impostazione attiva
  const [bloccato, setBloccato] = useState(false);          // schermata di blocco visibile ora
  const [parametri, setParametri] = useState([]);          // parametri creati dall'utente
  const [dopoParam, setDopoParam] = useState(null);        // cosa fare dopo averne creato uno
  const [problemaAperto, setProblemaAperto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [lang, setLangState] = useState('it');
  const [promemoria, setPromemoria] = useState(false);

  useEffect(()=>{
    (async()=>{
      try {
        const r=await window.storage.get('ht-lang');
        // Prima apertura: usa la lingua del telefono, se è tra quelle supportate
        const auto=(navigator.language||'it').slice(0,2).toLowerCase();
        const scelta = r?.value || (LANGS.some(l=>l.code===auto) ? auto : 'it');
        setLang(scelta); setLangState(scelta);
      } catch(e){}
      try { const r=await window.storage.get('ht-promemoria'); if(r?.value==='1') setPromemoria(true); } catch(e){}
      try { const r=await window.storage.get('ht-cartella'); if(r?.value) setCartella(JSON.parse(r.value)); } catch(e){}
      try { const r=await window.storage.get('ht-parametri'); if(r?.value) setParametri(JSON.parse(r.value)); } catch(e){}
      try { const r=await window.storage.get('ht-blocco'); if(r?.value==='1'){ setBlocco(true); setBloccato(true); } } catch(e){}
      try {
        const { caricaStato, inizializza } = await import('./acquisti');
        setPremiumState(await caricaStato());
        inizializza(p=>setPremiumState(p));   // in sottofondo: allinea con l'App Store
      } catch(e){}
      for (const [k,fn] of [['ht-visite',setVisite],['ht-analisi',setAnalisi],['ht-allenamenti',setAllenamenti],['ht-ricette',setRicette],['ht-note',setNote],['ht-terapie',setTerapie],['ht-problemi',setProblemi],['ht-allergie',setAllergie],['ht-esami',setEsami]]) {
        try { const r=await window.storage.get(k); if(r) fn(JSON.parse(r.value)); } catch(e){}
      }
      try {
        const r=await window.storage.get('ht-vitali');
        if(r){ const m=migraPressione(JSON.parse(r.value)); setVitali(m.list); if(m.changed) await window.storage.set('ht-vitali',JSON.stringify(m.list)); }
      } catch(e){}
      setLoading(false);
    })();
  },[]);

  const changeLang = async c => {
    setLang(c); setLangState(c);
    try { await window.storage.set('ht-lang', c); } catch(e){}
  };

  const sv = async (k,v) => { try { await window.storage.set(k,JSON.stringify(v)); } catch(e){} };

  const add = async (key, setter, item) => {
    const allFull = item.allegati||[];
    const allegatiMeta = allFull.map(({id,name,type,size})=>({id,name,type,size}));
    const record = {...item, id:Date.now(), allegati:allegatiMeta};
    if (allFull.length>0) {
      try { await window.storage.set(`ht-att-${record.id}`, JSON.stringify(allFull)); } catch(e){}
    }
    setter(prev=>{ const u=[...prev,record].sort((a,b)=>b.data.localeCompare(a.data)); sv(key,u); return u; });
    setModal(null);
  };

  const edit = async (key, setter, item) => {
    let record = {...item};
    if (Array.isArray(item.allegati)) {           // solo le sezioni che prevedono allegati
      const allFull = item.allegati;
      record.allegati = allFull.map(({id,name,type,size})=>({id,name,type,size}));
      try {
        if (allFull.length>0) await window.storage.set(`ht-att-${record.id}`, JSON.stringify(allFull));
        else await window.storage.delete(`ht-att-${record.id}`);
      } catch(e){}
    }
    setter(prev=>{ const u=prev.map(x=>x.id===record.id?record:x).sort((a,b)=>String(b.data).localeCompare(String(a.data))); sv(key,u); return u; });
    setModal(null);
  };

  const del = async (key, setter, id) => {
    try { await window.storage.delete(`ht-att-${id}`); } catch(e){}
    setter(prev=>{ const u=prev.filter(x=>x.id!==id); sv(key,u); return u; });
  };

  const toggleRicetta = id => setRicette(prev=>{ const u=prev.map(r=>r.id===id?{...r,usata:!r.usata}:r); sv('ht-ricette',u); return u; });
  const toggleNota = id => setNote(prev=>{ const u=prev.map(n=>n.id===id?{...n,archiviata:!n.archiviata}:n); sv('ht-note',u); return u; });

  // Riprogramma i promemoria quando cambiano visite, terapie o l'impostazione
  useEffect(()=>{
    if (loading) return;
    const conOrari = terapie.some(x=>x.promemoria && x.orari?.length);
    if (!promemoria && !conOrari) return;
    (async()=>{
      const { aggiornaPromemoria } = await import('./promemoria');
      await aggiornaPromemoria(visite, promemoria, terapie);
    })();
  },[visite, terapie, promemoria, loading]);

  const tentaSblocco = async () => {
    const { sblocca } = await import('./blocco');
    if (await sblocca(t('lock_reason'))) setBloccato(false);
  };

  // Chiede lo sblocco appena la schermata compare, e ri-blocca quando l'app torna dallo sfondo
  useEffect(()=>{ if (bloccato) tentaSblocco(); },[bloccato]);
  useEffect(()=>{
    if (!blocco) return;
    const suRitorno = () => { if (document.visibilityState==='visible') setBloccato(true); };
    document.addEventListener('visibilitychange', suRitorno);
    return ()=>document.removeEventListener('visibilitychange', suRitorno);
  },[blocco]);

  const cambiaBlocco = async attiva => {
    if (!attiva) {
      setBlocco(false);
      try { await window.storage.set('ht-blocco','0'); } catch(e){}
      return null;
    }
    const { bloccoDisponibile, sblocca } = await import('./blocco');
    if (!(await bloccoDisponibile())) return t('lock_unavailable');
    if (!(await sblocca(t('lock_reason')))) return t('lock_failed');
    setBlocco(true);
    try { await window.storage.set('ht-blocco','1'); } catch(e){}
    return t('lock_on');
  };

  const cambiaPromemoria = async attiva => {
    const { notificheDisponibili, chiediPermesso, aggiornaPromemoria } = await import('./promemoria');
    if (!attiva) {
      setPromemoria(false);
      try { await window.storage.set('ht-promemoria','0'); } catch(e){}
      await aggiornaPromemoria([], false, terapie);
      return null;
    }
    if (!(await notificheDisponibili())) return t('notif_unavailable');
    if (!(await chiediPermesso())) return t('notif_denied');
    setPromemoria(true);
    try { await window.storage.set('ht-promemoria','1'); } catch(e){}
    const r = await aggiornaPromemoria(visite, true, terapie);
    return r.n>0 ? t('notif_set',r.n) : t('notif_none');
  };

  // Aggiorna un problema del diario (usato per stato, aggiornamenti e collegamenti)
  const patchProblema = (id, fn) => setProblemi(prev=>{
    const u = prev.map(p=>p.id===id?fn(p):p);
    sv('ht-problemi',u);
    const nuovo = u.find(p=>p.id===id);
    if (nuovo) setProblemaAperto(nuovo);
    return u;
  });

  const TABS = [{id:'home',i:'🏠'},{id:'visite',i:'👨‍⚕️'},{id:'analisi',i:'🩸'},{id:'vitali',i:'💓'},{id:'altro',i:'⋯'}];
  const SEZ_ALTRO = ['diario','esami','allergie','sport','ricette','note'];

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{background:'#f8faff'}}>
      <div className="text-center"><p className="text-4xl mb-3">⏳</p><p className="text-gray-400">{t('loading')}</p></div>
    </div>
  );

  // Schermata di blocco: i dati non vengono mostrati finché non ci si identifica
  if (bloccato) return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8" style={{background:'#f8faff'}}>
      <p className="text-6xl mb-4">🔒</p>
      <p className="font-black text-gray-800 text-lg">HealthTracker</p>
      <p className="text-sm text-gray-400 mt-1 text-center">{t('lock_locked')}</p>
      <button onClick={tentaSblocco}
        className="mt-6 px-8 py-3.5 rounded-2xl font-bold text-white text-sm"
        style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
        {t('lock_unlock')}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{background:'#f8faff',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
      <div className="px-5 pb-4 flex items-center gap-3 flex-shrink-0" style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)',paddingTop:'calc(env(safe-area-inset-top) + 1rem)'}}>
        <button onClick={()=>setModal('settings')} title={t('settings')} className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl active:opacity-60 transition-opacity" style={{background:'rgba(255,255,255,0.2)'}}>🏥</button>
        <div><h1 className="font-black text-white text-base leading-tight">HealthTracker</h1><p className="text-blue-200 text-xs">{t('tagline')}</p></div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setModal('search')} title={t('search_title')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg hover:opacity-80 transition-opacity" style={{background:'rgba(255,255,255,0.15)'}}>🔍</button>
          <button onClick={()=>setModal('export')} title={t('export_short')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg hover:opacity-80 transition-opacity" style={{background:'rgba(255,255,255,0.15)'}}>📥</button>
          <div className="px-3 py-1.5 rounded-full" style={{background:'rgba(255,255,255,0.15)'}}>
            <p className="text-blue-100 text-xs font-semibold">{new Date().toLocaleDateString(locale(),{day:'2-digit',month:'short',year:'numeric'})}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{paddingBottom:'calc(80px + env(safe-area-inset-bottom))'}}>
        <div className="px-4 py-5 max-w-lg mx-auto">
          {tab==='home'    && <Dashboard visite={visite} analisi={analisi} vitali={vitali} terapie={terapie} problemi={problemi}
            ricette={ricette} note={note} allergie={allergie} allenamenti={allenamenti} cartella={cartella}
            onGo={id=>{setProblemaAperto(null); setTab(id);}}
            onNuovo={id=>setModal(id)}
            onApri={(tipo,d)=>{
              if (tipo==='visita') setModal({t:'viewV',d});
              else if (tipo==='analisi') setModal({t:'viewA',d});
              else if (tipo==='percorso') { setProblemaAperto(d); setTab('diario'); }
            }}/>}
          {tab==='visite'  && <Visite visite={visite} onAdd={()=>setModal('visita')} onDel={id=>del('ht-visite',setVisite,id)} onView={v=>setModal({t:'viewV',d:v})}/>}
          {tab==='analisi' && <AnalisiView analisi={analisi} onAdd={()=>setModal('analisi')} onDel={id=>del('ht-analisi',setAnalisi,id)} onView={a=>setModal({t:'viewA',d:a})}/>}
          {tab==='vitali'  && <VitaliView vitali={vitali} onAdd={()=>setModal('vitale')} onEdit={v=>setModal({t:'editVit',d:v})} onDel={id=>del('ht-vitali',setVitali,id)}/>}
          {tab==='sport'   && <AllenamentiView allenamenti={allenamenti} onAdd={()=>setModal('allenamento')} onEdit={a=>setModal({t:'editS',d:a})} onDel={id=>del('ht-allenamenti',setAllenamenti,id)}/>}
          {tab==='ricette' && <RicetteView ricette={ricette} onAdd={()=>setModal('ricetta')} onToggle={toggleRicetta} onEdit={r=>setModal({t:'editR',d:r})} onDel={id=>del('ht-ricette',setRicette,id)}/>}
          {tab==='note'    && <NoteView note={note} onAdd={()=>setModal('nota')} onArch={toggleNota} onDel={id=>del('ht-note',setNote,id)} onView={n=>setModal({t:'viewN',d:n})}/>}
          {tab==='esami'   && <EsamiView esami={esami} onAdd={()=>setModal('esame')} onEdit={e=>setModal({t:'editE',d:e})} onDel={id=>del('ht-esami',setEsami,id)} onView={e=>setModal({t:'viewE',d:e})}/>}
          {tab==='allergie' && <AllergieView allergie={allergie} onAdd={()=>setModal('allergia')} onEdit={a=>setModal({t:'editAl',d:a})} onDel={id=>del('ht-allergie',setAllergie,id)} onView={a=>setModal({t:'viewAl',d:a})}/>}
          {tab==='diario' && (problemaAperto
            ? <ProblemaDetail
                p={problemaAperto} terapie={terapie} visite={visite} analisi={analisi} note={note} allenamenti={allenamenti}
                onBack={()=>setProblemaAperto(null)}
                onEdit={()=>setModal({t:'editP',d:problemaAperto})}
                onStato={s=>patchProblema(problemaAperto.id,p=>({...p,stato:s}))}
                onAddTer={()=>setModal({t:'newTer',d:problemaAperto.id})}
                onEditTer={x=>setModal({t:'editT',d:x})}
                onDelTer={id=>del('ht-terapie',setTerapie,id)}
                onAddAgg={()=>setModal('aggiornamento')}
                onEditAgg={a=>setModal({t:'editAgg',d:a})}
                onDelAgg={idA=>{ window.storage.delete(`ht-att-${idA}`).catch(()=>{}); patchProblema(problemaAperto.id,p=>({...p,aggiornamenti:(p.aggiornamenti||[]).filter(a=>a.id!==idA)})); }}
                onLinkV={()=>setModal('linkV')}
                onLinkA={()=>setModal('linkA')}
                onLinkN={()=>setModal('linkN')}
                onLinkS={()=>setModal('linkS')}
                onApriV={v=>setModal({t:'viewV',d:v})}
                onApriA={a=>setModal({t:'viewA',d:a})}
                onApriN={n=>setModal({t:'viewN',d:n})}
                onEditS={s=>setModal({t:'editS',d:s})}
              />
            : <DiarioView problemi={problemi} terapie={terapie} onAdd={()=>setModal('problema')}
                onOpen={p=>setProblemaAperto(p)} onDel={id=>del('ht-problemi',setProblemi,id)}
                onEditTer={x=>setModal({t:'editT',d:x})} onDelTer={id=>del('ht-terapie',setTerapie,id)}/>)}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex bg-white" style={{borderTop:'1px solid #f3f4f6',boxShadow:'0 -8px 24px rgba(0,0,0,0.06)',paddingBottom:'env(safe-area-inset-bottom)'}}>
        {TABS.map(x=>{
          const attivo = x.id==='altro' ? SEZ_ALTRO.includes(tab) : tab===x.id;
          return (
            <button key={x.id} onClick={()=>x.id==='altro'?setModal('altro'):setTab(x.id)} className="flex-1 min-w-0 flex flex-col items-center py-3 gap-0.5 transition-colors">
              <span className="text-xl leading-none">{x.i}</span>
              <span className="font-bold truncate max-w-full px-0.5" style={{fontSize:'11px',color:attivo?'#1e40af':'#9ca3af'}}>{x.id==='altro'&&SEZ_ALTRO.includes(tab)?tTab(tab):tTab(x.id)}</span>
              {attivo&&<div className="w-1.5 h-1.5 rounded-full mt-0.5" style={{background:'#1e40af'}}/>}
            </button>
          );
        })}
      </div>

      {modal==='visita'   && <VisitaModal  onSave={d=>add('ht-visite',setVisite,d)}  onClose={()=>setModal(null)}/>}
      {modal?.t==='editV' && <VisitaModal iniziale={modal.d} onSave={d=>edit('ht-visite',setVisite,d)} onClose={()=>setModal(null)}/>}
      {modal==='analisi'  && <AnalisiModal parametri={parametri} onNuovoParam={cb=>{setDopoParam(()=>cb); setModal({t:'nuovoParam', d:'analisi'});}}
        onSave={d=>add('ht-analisi',setAnalisi,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='nuovoParam' && <NuovoParametroModal onClose={()=>setModal(modal.d==='analisi'?'analisi':{t:'editA',d:modal.d})}
        onSave={p=>{
          setParametri(prev=>{ const u=[...prev.filter(x=>x.n!==p.n), p]; sv('ht-parametri',u); return u; });
          setModal(modal.d==='analisi'?'analisi':{t:'editA',d:modal.d});
          setTimeout(()=>dopoParam?.(p.n), 50);
        }}/>}
      {modal==='vitale'   && <VitaleModal  onSave={d=>add('ht-vitali',setVitali,d)}  onClose={()=>setModal(null)}/>}
      {modal==='allenamento' && <AllenamentoModal onSave={d=>add('ht-allenamenti',setAllenamenti,d)} onClose={()=>setModal(null)}/>}
      {modal==='ricetta'  && <RicettaModal onSave={d=>add('ht-ricette',setRicette,d)} onClose={()=>setModal(null)}/>}
      {modal==='nota'     && <NotaModal onSave={d=>add('ht-note',setNote,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='newTer' && <TerapiaModal problemaId={modal.d} onPremium={()=>setModal('premium')} onSave={d=>add('ht-terapie',setTerapie,d)} onClose={()=>setModal(null)}/>}
      {modal==='esame'    && <EsameModal onSave={d=>add('ht-esami',setEsami,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='editE'  && <EsameModal iniziale={modal.d} onSave={d=>edit('ht-esami',setEsami,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewE'  && <ViewEsameModal e={modal.d} onEdit={e=>setModal({t:'editE',d:e})} onClose={()=>setModal(null)}/>}
      {modal==='allergia' && <AllergiaModal onSave={d=>add('ht-allergie',setAllergie,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='editAl' && <AllergiaModal iniziale={modal.d} onSave={d=>edit('ht-allergie',setAllergie,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewAl' && <ViewAllergiaModal a={modal.d} onEdit={a=>setModal({t:'editAl',d:a})} onClose={()=>setModal(null)}/>}
      {modal==='problema' && <ProblemaModal onSave={d=>add('ht-problemi',setProblemi,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='editP' && <ProblemaModal iniziale={modal.d} onSave={d=>{edit('ht-problemi',setProblemi,d); setProblemaAperto({...problemaAperto,...d});}} onClose={()=>setModal(null)}/>}
      {modal==='aggiornamento' && <AggiornamentoModal onClose={()=>setModal(null)}
        onSave={async d=>{ const id=Date.now(); await salvaAllegatiAgg(id,d.allegati); patchProblema(problemaAperto.id,p=>({...p,aggiornamenti:[...(p.aggiornamenti||[]),{...d,id,allegati:metaAllegati(d.allegati)}]})); setModal(null); }}/>}
      {modal?.t==='editAgg' && <AggiornamentoModal iniziale={modal.d} onClose={()=>setModal(null)}
        onSave={async d=>{ await salvaAllegatiAgg(d.id,d.allegati); patchProblema(problemaAperto.id,p=>({...p,aggiornamenti:(p.aggiornamenti||[]).map(a=>a.id===d.id?{...d,allegati:metaAllegati(d.allegati)}:a)})); setModal(null); }}/>}
      {modal==='linkV' && <CollegaModal titolo={`👨‍⚕️ ${t('link_visits')}`} selezionati={problemaAperto?.visite}
        elementi={visite.map(v=>({id:v.id,tit:`Dr. ${v.medico}`,sub:tv(v.spec),data:v.data}))}
        onSave={ids=>{ patchProblema(problemaAperto.id,p=>({...p,visite:ids})); setModal(null); }} onClose={()=>setModal(null)}/>}
      {modal==='linkA' && <CollegaModal titolo={`🩸 ${t('link_tests')}`} selezionati={problemaAperto?.analisi}
        elementi={analisi.map(a=>({id:a.id,tit:t('test_of',fmt(a.data)),sub:t('params_n',(a.params||[]).length),data:a.data}))}
        onSave={ids=>{ patchProblema(problemaAperto.id,p=>({...p,analisi:ids})); setModal(null); }} onClose={()=>setModal(null)}/>}
      {modal==='linkN' && <CollegaModal titolo={`📝 ${t('link_notes')}`} selezionati={problemaAperto?.note}
        elementi={note.map(n=>({id:n.id,tit:n.titolo,sub:n.testo,data:n.data}))}
        onSave={ids=>{ patchProblema(problemaAperto.id,p=>({...p,note:ids})); setModal(null); }} onClose={()=>setModal(null)}/>}
      {modal==='linkS' && <CollegaModal titolo={`💪 ${t('link_workouts')}`} selezionati={problemaAperto?.allenamenti}
        elementi={allenamenti.map(s=>({id:s.id,tit:tv(s.tipo),sub:`${s.durata} min`,data:s.data}))}
        onSave={ids=>{ patchProblema(problemaAperto.id,p=>({...p,allenamenti:ids})); setModal(null); }} onClose={()=>setModal(null)}/>}
      {modal==='altro'    && <AltroModal onGo={id=>{setTab(id);setModal(null);}} onClose={()=>setModal(null)}/>}
      {modal==='search'   && <SearchModal dati={{visite,analisi,note,ricette,terapie,allenamenti,vitali,problemi,allergie,esami}} onGo={id=>{setTab(id);setProblemaAperto(null);setModal(null);}} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewN' && <ViewNotaModal n={modal.d} onEdit={n=>setModal({t:'editN',d:n})} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewV' && <ViewVisitaModal v={modal.d} onEdit={v=>setModal({t:'editV',d:v})} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewA' && <ViewAnalisiModal a={modal.d} onEdit={a=>setModal({t:'editA',d:a})} onClose={()=>setModal(null)}/>}
      {modal?.t==='editA'   && <AnalisiModal iniziale={modal.d} parametri={parametri}
        onNuovoParam={cb=>{setDopoParam(()=>cb); setModal({t:'nuovoParam', d:modal.d});}}
        onSave={d=>edit('ht-analisi',setAnalisi,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='editVit' && <VitaleModal iniziale={modal.d} onSave={d=>edit('ht-vitali',setVitali,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='editS'   && <AllenamentoModal iniziale={modal.d} onSave={d=>edit('ht-allenamenti',setAllenamenti,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='editR'   && <RicettaModal iniziale={modal.d} onSave={d=>edit('ht-ricette',setRicette,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='editN'   && <NotaModal iniziale={modal.d} onSave={d=>edit('ht-note',setNote,d)} onClose={()=>setModal(null)}/>}
      {modal?.t==='editT'   && <TerapiaModal iniziale={modal.d} problemi={problemi} onPremium={()=>setModal('premium')} onSave={d=>edit('ht-terapie',setTerapie,d)} onClose={()=>setModal(null)}/>}
      {modal==='export'   && <ExportModal visite={visite} analisi={analisi} vitali={vitali} onClose={()=>setModal(null)}/>}
      {modal==='settings' && <SettingsModal lang={lang} onLang={changeLang} promemoria={promemoria} onPromemoria={cambiaPromemoria}
        blocco={blocco} onBlocco={cambiaBlocco}
        onExport={()=>setModal('export')} onReferto={()=>setModal('referto')} onStat={()=>setModal('statistiche')} onBackup={()=>setModal('backup')}
        cartella={cartella} onCartella={()=>setModal('cartella')}
        premium={premium} onPremium={()=>setModal('premium')} onClose={()=>setModal(null)}/>}
      {modal==='premium' && <PremiumModal onSbloccato={()=>setPremiumState(true)} onClose={()=>setModal(null)}/>}
      {modal==='referto' && <RefertoModal dati={{cartella,allergie,terapie,analisi,visite,vitali,problemi}}
        onPremium={()=>setModal('premium')} onClose={()=>setModal(null)}/>}
      {modal==='backup' && <BackupModal onClose={()=>setModal(null)}/>}
      {modal==='statistiche' && <StatisticheModal dati={{analisi,vitali,allenamenti}}
        onPremium={()=>setModal('premium')} onClose={()=>setModal(null)}/>}
      {modal==='cartella' && <CartellaModal dati={cartella} allergie={allergie}
        ultimoPeso={vitali.find(v=>v.tipo==='Peso')?.valore ?? null}
        onSave={async d=>{ setCartella(d); try{ await window.storage.set('ht-cartella', JSON.stringify(d)); }catch(e){} setModal(null); }}
        onClose={()=>setModal(null)}/>}
    </div>
  );
}
