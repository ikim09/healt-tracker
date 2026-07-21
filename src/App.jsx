import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const SPEC = ["Medicina generale","Cardiologia","Dermatologia","Endocrinologia","Gastroenterologia","Ginecologia","Neurologia","Oftalmologia","Ortopedia","Otorinolaringoiatria","Pneumologia","Reumatologia","Urologia","Altro"];
const PARAMS = [
  {n:"Glicemia",u:"mg/dL",min:70,max:99},{n:"Colesterolo totale",u:"mg/dL",min:0,max:200},
  {n:"Colesterolo HDL",u:"mg/dL",min:40,max:null},{n:"Colesterolo LDL",u:"mg/dL",min:0,max:130},
  {n:"Trigliceridi",u:"mg/dL",min:0,max:150},{n:"Emoglobina",u:"g/dL",min:12,max:17.5},
  {n:"Ematocrito",u:"%",min:36,max:53},{n:"Globuli bianchi",u:"×10³/µL",min:4.5,max:11},
  {n:"Globuli rossi",u:"M/µL",min:4.5,max:5.9},{n:"Piastrine",u:"×10³/µL",min:150,max:400},
  {n:"Creatinina",u:"mg/dL",min:0.6,max:1.3},{n:"Urea",u:"mg/dL",min:10,max:50},
  {n:"AST/GOT",u:"U/L",min:0,max:40},{n:"ALT/GPT",u:"U/L",min:0,max:40},
  {n:"Gamma-GT",u:"U/L",min:0,max:55},{n:"TSH",u:"mUI/L",min:0.4,max:4},
  {n:"Ferro",u:"µg/dL",min:60,max:170},{n:"Ferritina",u:"ng/mL",min:12,max:300},
  {n:"VES",u:"mm/h",min:0,max:20},{n:"PCR",u:"mg/L",min:0,max:5},
  {n:"Vitamina D",u:"ng/mL",min:30,max:100},{n:"Vitamina B12",u:"pg/mL",min:200,max:900},
];
const VITALI = [
  {n:"Peso",u:"kg",c:"#3b82f6"},{n:"Pressione sistolica",u:"mmHg",c:"#ef4444"},
  {n:"Pressione diastolica",u:"mmHg",c:"#f97316"},{n:"Frequenza cardiaca",u:"bpm",c:"#ec4899"},
  {n:"Temperatura",u:"°C",c:"#a855f7"},{n:"Saturazione O₂",u:"%",c:"#06b6d4"},
];

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
const dlCSV = (name,content) => { const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(content);a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a); };
const fmtSize = b => b>1024*1024?`${(b/1024/1024).toFixed(1)} MB`:`${Math.round(b/1024)} KB`;
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
      {opts.map(o=><option key={o}>{o}</option>)}
    </select>
  </div>
);
const Txt = ({lbl,...p}) => (
  <div className="mb-3">
    {lbl&&<label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lbl}</label>}
    <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all resize-none" rows={3} {...p}/>
  </div>
);
function Modal({title,onClose,onSave,saveLabel="Salva",saveBg="linear-gradient(135deg,#1e40af,#3b82f6)",children}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{background:'rgba(0,0,0,0.55)'}}>
      <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" style={{maxHeight:'92vh',display:'flex',flexDirection:'column'}}>
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
  const MAX = 4;
  const handleChange = async e => {
    const picked = Array.from(e.target.files).slice(0, MAX-files.length);
    const added = [];
    for (const f of picked) {
      if (f.size > 4*1024*1024) { alert(`"${f.name}" supera i 4 MB consentiti.`); continue; }
      try { const data=await readFile(f); added.push({id:`att-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:f.name,type:f.type,size:f.size,data}); }
      catch(e) { alert(`Errore nella lettura di "${f.name}".`); }
    }
    if (added.length) onChange([...files,...added].slice(0,MAX));
    e.target.value='';
  };
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">📎 Allegati ({files.length}/{MAX})</label>
        {files.length<MAX&&<button type="button" onClick={()=>ref.current?.click()} className="text-xs text-blue-500 font-bold hover:text-blue-700">+ Aggiungi file</button>}
      </div>
      <input ref={ref} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleChange}/>
      {files.length>0 ? (
        <div className="space-y-1.5">
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
          <p className="text-xs text-gray-400">Tocca per aggiungere un file</p>
          <p className="text-xs text-gray-300 mt-0.5">Immagini e PDF · max 4 MB/file</p>
        </div>
      )}
    </div>
  );
}

function AttachmentViewer({file, onClose}) {
  const isImg = file.type.startsWith('image/');
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{background:'rgba(0,0,0,0.7)'}}>
      <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" style={{maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{fileIcon(file.type)}</span>
            <h3 className="font-bold text-gray-800 text-sm truncate">{file.name}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 font-bold text-lg flex-shrink-0 ml-2">×</button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">
          {isImg
            ? <img src={file.data} alt={file.name} className="w-full rounded-2xl object-contain max-h-72"/>
            : <div className="text-center py-10"><p className="text-6xl mb-3">{fileIcon(file.type)}</p><p className="font-semibold text-gray-700">{file.name}</p><p className="text-xs text-gray-400 mt-1">{fmtSize(file.size)}</p></div>}
        </div>
        <div className="px-5 pb-6 pt-3 border-t border-gray-50">
          <a href={file.data} download={file.name} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-bold text-white text-sm" style={{background:'linear-gradient(135deg,#1e40af,#3b82f6)'}}>
            ⬇️ Scarica {file.name}
          </a>
        </div>
      </div>
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
      if (full) setViewer(full); else alert('Allegato non trovato.');
    } catch(e) { alert('Impossibile caricare l\'allegato.'); }
    setLoadingId(null);
  };
  return (
    <>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">📎 Allegati ({allegati.length})</p>
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
function VisitaModal({onSave, onClose}) {
  const [f, sf] = useState({data:'',medico:'',spec:'Medicina generale',diagnosi:'',note:'',allegati:[]});
  const s = (k,v) => sf(p=>({...p,[k]:v}));
  const ok = f.data && f.medico.trim();
  return (
    <Modal title="🏥 Nuova Visita Medica" onClose={onClose} onSave={ok?()=>onSave(f):null} saveLabel={ok?"Salva Visita":"Inserisci data e medico"}>
      <Inp lbl="Data *" type="date" value={f.data} onChange={e=>s('data',e.target.value)}/>
      <Inp lbl="Medico *" placeholder="Es. Dr. Rossi" value={f.medico} onChange={e=>s('medico',e.target.value)}/>
      <Sel lbl="Specialità" opts={SPEC} value={f.spec} onChange={e=>s('spec',e.target.value)}/>
      <Inp lbl="Diagnosi / Motivo" placeholder="Es. Controllo annuale" value={f.diagnosi} onChange={e=>s('diagnosi',e.target.value)}/>
      <Txt lbl="Note" placeholder="Terapia, prescrizioni, follow-up..." value={f.note} onChange={e=>s('note',e.target.value)}/>
      <AttachmentPicker files={f.allegati} onChange={v=>s('allegati',v)}/>
    </Modal>
  );
}

function AnalisiModal({onSave, onClose}) {
  const [f, sf] = useState({data:'',note:'',params:[],allegati:[]});
  const [sp, setSp] = useState('');
  const [vp, setVp] = useState('');
  const addP = () => {
    if (!sp||!vp) return;
    const def=PARAMS.find(p=>p.n===sp);
    sf(prev=>({...prev,params:[...prev.params.filter(p=>p.n!==sp),{n:sp,u:def?.u||'',v:parseFloat(vp),min:def?.min,max:def?.max}]}));
    setSp(''); setVp('');
  };
  const ok = f.data && f.params.length>0;
  return (
    <Modal title="🩸 Nuova Analisi del Sangue" onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?"Salva Analisi":"Aggiungi data e almeno un parametro"} saveBg="linear-gradient(135deg,#be123c,#f43f5e)">
      <Inp lbl="Data *" type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Txt lbl="Note" placeholder="Laboratorio, annotazioni..." value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
      <div className="mb-3">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Aggiungi Parametro *</label>
        <div className="flex gap-2 mb-2">
          <select value={sp} onChange={e=>setSp(e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400 min-w-0">
            <option value="">-- Scegli parametro --</option>
            {PARAMS.filter(p=>!f.params.find(fp=>fp.n===p.n)).map(p=><option key={p.n}>{p.n}</option>)}
          </select>
          <input type="number" step="0.01" placeholder="Val." value={vp} onChange={e=>setVp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addP()}
            className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400 text-center"/>
          <button onClick={addP} className="w-11 h-11 rounded-xl bg-red-500 text-white font-bold text-xl hover:bg-red-600 flex items-center justify-center flex-shrink-0">+</button>
        </div>
        {f.params.length>0&&(
          <div className="bg-gray-50 rounded-2xl p-3 space-y-1.5 max-h-40 overflow-y-auto">
            {f.params.map(p=>(
              <div key={p.n} className={`flex items-center justify-between px-3 py-2 rounded-xl ${isAbn(p)?'bg-red-50 border border-red-100':'bg-white'}`}>
                <span className={`text-xs ${isAbn(p)?'text-red-600 font-semibold':'text-gray-700'}`}>{p.n}</span>
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
      <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>
    </Modal>
  );
}

function VitaleModal({onSave, onClose}) {
  const [f, sf] = useState({data:'',tipo:VITALI[0].n,valore:''});
  const ti = VITALI.find(v=>v.n===f.tipo);
  const ok = f.data && f.valore;
  return (
    <Modal title="💓 Nuovo Dato Vitale" onClose={onClose} onSave={ok?()=>onSave(f):null} saveLabel="Salva" saveBg="linear-gradient(135deg,#7e22ce,#a855f7)">
      <Inp lbl="Data *" type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Sel lbl="Tipo" opts={VITALI.map(v=>v.n)} value={f.tipo} onChange={e=>sf(p=>({...p,tipo:e.target.value}))}/>
      <Inp lbl={`Valore${ti?' ('+ti.u+')':''} *`} type="number" step="0.1" placeholder="0.0" value={f.valore} onChange={e=>sf(p=>({...p,valore:e.target.value}))}/>
    </Modal>
  );
}

function ViewVisitaModal({v, onClose}) {
  return (
    <Modal title={`🏥 Visita del ${fmt(v.data)}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-blue-50 rounded-2xl p-3"><p className="text-xs text-blue-400 font-bold uppercase tracking-wide">Medico</p><p className="font-bold text-blue-800 text-sm mt-1">Dr. {v.medico}</p></div>
        <div className="bg-blue-50 rounded-2xl p-3"><p className="text-xs text-blue-400 font-bold uppercase tracking-wide">Specialità</p><p className="font-bold text-blue-800 text-sm mt-1">{v.spec}</p></div>
      </div>
      {v.diagnosi&&<div className="bg-gray-50 rounded-2xl p-3 mb-3"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">Diagnosi / Motivo</p><p className="text-sm text-gray-700">{v.diagnosi}</p></div>}
      {v.note&&<div className="bg-gray-50 rounded-2xl p-3 mb-2"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">Note</p><p className="text-sm text-gray-600 italic">{v.note}</p></div>}
      <InlineAttachments allegati={v.allegati} recordId={v.id}/>
    </Modal>
  );
}

function ViewAnalisiModal({a, onClose}) {
  const params=a.params||[], totAbn=params.filter(isAbn).length;
  return (
    <Modal title={`Analisi del ${fmt(a.data)}`} onClose={onClose}>
      {a.note&&<div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600 mb-4 italic">"{a.note}"</div>}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-50 rounded-2xl p-4 text-center"><p className="text-3xl font-bold text-blue-700">{params.length}</p><p className="text-xs text-blue-400 font-semibold mt-0.5">Parametri</p></div>
        <div className={`rounded-2xl p-4 text-center ${totAbn>0?'bg-red-50':'bg-green-50'}`}><p className={`text-3xl font-bold ${totAbn>0?'text-red-600':'text-green-600'}`}>{totAbn}</p><p className={`text-xs font-semibold mt-0.5 ${totAbn>0?'text-red-400':'text-green-400'}`}>{totAbn>0?'Anomali':'Tutti ok ✓'}</p></div>
      </div>
      <div className="space-y-2">
        {params.map(p=>(
          <div key={p.n} className={`flex justify-between items-center p-3.5 rounded-2xl ${isAbn(p)?'bg-red-50 border border-red-100':'bg-gray-50'}`}>
            <div>
              <p className={`text-sm font-semibold ${isAbn(p)?'text-red-700':'text-gray-700'}`}>{p.n}</p>
              {refRange(p)!==null&&<p className="text-xs text-gray-400 mt-0.5">Rif: {refRange(p)} {p.u}</p>}
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

function ExportModal({visite,analisi,vitali,onClose}) {
  const expVisite = () => {
    const h=['Data','Medico','Specialità','Diagnosi','Note','N. Allegati'];
    const r=visite.map(v=>[fmt(v.data),v.medico,v.spec,v.diagnosi||'',v.note||'',(v.allegati||[]).length]);
    dlCSV('visite_mediche.csv',mkCSV(h,r));
  };
  const expAnalisi = () => {
    const h=['Data','Parametro','Valore','Unità','Rif. Min','Rif. Max','Anomalo','Note'];
    const r=[];
    analisi.forEach(a=>(a.params||[]).forEach(p=>r.push([fmt(a.data),p.n,p.v,p.u,p.min??'',p.max??'',isAbn(p)?'Sì':'No',a.note||''])));
    dlCSV('analisi_sangue.csv',mkCSV(h,r));
  };
  const expVitali = () => {
    const h=['Data','Tipo','Valore','Unità'];
    const r=vitali.map(v=>[fmt(v.data),v.tipo,v.valore,VITALI.find(x=>x.n===v.tipo)?.u||'']);
    dlCSV('dati_vitali.csv',mkCSV(h,r));
  };
  const expAll = () => { expVisite(); setTimeout(expAnalisi,350); setTimeout(expVitali,700); };
  const items=[
    {l:'👨‍⚕️ Visite Mediche',c:visite.length,f:expVisite,bg:'#eff6ff',col:'#1e40af'},
    {l:'🩸 Analisi del Sangue',c:analisi.length,f:expAnalisi,bg:'#fff1f2',col:'#be123c'},
    {l:'💓 Dati Vitali',c:vitali.length,f:expVitali,bg:'#fdf4ff',col:'#7e22ce'},
  ];
  const tot=visite.length+analisi.length+vitali.length;
  return (
    <Modal title="📥 Esporta dati CSV" onClose={onClose}>
      <p className="text-sm text-gray-400 mb-5">Scarica i tuoi dati in formato CSV, compatibile con Excel, Google Sheets e Numbers.</p>
      <div className="space-y-3 mb-4">
        {items.map(it=>(
          <button key={it.l} onClick={it.c>0?it.f:undefined} disabled={it.c===0}
            className="w-full flex items-center justify-between px-4 py-4 rounded-2xl transition-all hover:opacity-80 disabled:opacity-35 disabled:cursor-not-allowed text-left"
            style={{background:it.bg}}>
            <div>
              <p className="font-bold text-sm" style={{color:it.col}}>{it.l}</p>
              <p className="text-xs mt-0.5" style={{color:it.col,opacity:.6}}>{it.c} record</p>
            </div>
            <span className="text-xl">⬇️</span>
          </button>
        ))}
      </div>
      <button onClick={expAll} disabled={tot===0}
        className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40"
        style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
        ⬇️ Esporta Tutto (3 file CSV)
      </button>
      <p className="text-xs text-gray-300 text-center mt-3">I file vengono salvati nella cartella Download</p>
    </Modal>
  );
}

// --- Views ---
function Dashboard({visite, analisi, vitali}) {
  const lv=visite[0], la=analisi[0];
  const abn=(la?.params||[]).filter(isAbn).length;
  const lp=vitali.find(v=>v.tipo==='Peso'), lfc=vitali.find(v=>v.tipo==='Frequenza cardiaca');
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[{v:visite.length,l:'Visite',bg:'#eff6ff',c:'#1e40af',i:'👨‍⚕️'},{v:analisi.length,l:'Analisi',bg:'#fff1f2',c:'#be123c',i:'🩸'},{v:vitali.length,l:'Misurazioni',bg:'#fdf4ff',c:'#7e22ce',i:'💓'},{v:abn,l:abn>0?'Anomalie':'Valori ok',bg:abn>0?'#fffbeb':'#f0fdf4',c:abn>0?'#92400e':'#166534',i:abn>0?'⚠️':'✅'}].map(s=>(
          <div key={s.l} className="rounded-2xl p-4" style={{background:s.bg}}>
            <div className="text-xl mb-1">{s.i}</div>
            <div className="text-3xl font-black" style={{color:s.c}}>{s.v}</div>
            <div className="text-xs font-semibold mt-0.5" style={{color:s.c,opacity:.7}}>{s.l}</div>
          </div>
        ))}
      </div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Aggiornamenti recenti</p>
      <div className="space-y-3">
        {lv&&(
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'#eff6ff',color:'#1e40af'}}>{lv.spec}</span>
              {lv.allegati?.length>0&&<span className="text-xs text-blue-300">📎 {lv.allegati.length}</span>}
              <span className="ml-auto text-xs text-gray-400">{fmt(lv.data)}</span>
            </div>
            <p className="font-bold text-gray-800 text-sm">Dr. {lv.medico}</p>
            {lv.diagnosi&&<p className="text-xs text-gray-500 mt-0.5">{lv.diagnosi}</p>}
          </div>
        )}
        {la&&(
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'#fff1f2',color:'#be123c'}}>Ultima analisi</span>
              {la.allegati?.length>0&&<span className="text-xs text-blue-300">📎 {la.allegati.length}</span>}
              <span className="ml-auto text-xs text-gray-400">{fmt(la.data)}</span>
            </div>
            <p className="font-bold text-gray-800 text-sm">{(la.params||[]).length} parametri</p>
            <p className={`text-xs mt-0.5 ${abn>0?'text-red-500':'text-green-500'}`}>{abn>0?`⚠ ${abn} valore${abn>1?'i':''} fuori range`:'✓ Tutti i valori nella norma'}</p>
          </div>
        )}
        {(lp||lfc)&&(
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ultimi dati vitali</p>
            <div className="flex gap-5">
              {lp&&<div><p className="text-2xl font-black text-blue-600">{lp.valore} <span className="text-sm font-normal text-gray-400">kg</span></p><p className="text-xs text-gray-400">Peso · {fmt(lp.data)}</p></div>}
              {lfc&&<div><p className="text-2xl font-black text-pink-500">{lfc.valore} <span className="text-sm font-normal text-gray-400">bpm</span></p><p className="text-xs text-gray-400">FC · {fmt(lfc.data)}</p></div>}
            </div>
          </div>
        )}
        {!lv&&!la&&!lp&&(
          <div className="text-center py-16">
            <p className="text-6xl mb-4">🏥</p>
            <p className="text-gray-400 font-semibold">Nessun dato ancora inserito</p>
            <p className="text-gray-300 text-sm mt-1">Usa le schede in basso per iniziare!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Visite({visite, onAdd, onDel, onView}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">Visite Mediche</h2><p className="text-xs text-gray-400">{visite.length} registrat{visite.length===1?'a':'e'}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#1e40af,#3b82f6)'}}>+ Nuova</button>
      </div>
      {visite.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">👨‍⚕️</p><p className="text-gray-400">Nessuna visita registrata</p></div>
      ):(
        <div className="space-y-3">
          {visite.map(v=>(
            <div key={v.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:shadow-md transition-all" onClick={()=>onView(v)}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'#eff6ff',color:'#1e40af'}}>{v.spec}</span>
                    <span className="text-xs text-gray-400">{fmt(v.data)}</span>
                    {v.allegati?.length>0&&<span className="text-xs text-blue-400 font-medium">📎 {v.allegati.length}</span>}
                  </div>
                  <p className="font-bold text-gray-800">Dr. {v.medico}</p>
                  {v.diagnosi&&<p className="text-sm text-gray-500 mt-0.5 truncate">{v.diagnosi}</p>}
                  <p className="text-xs text-gray-300 mt-1">Tocca per dettagli →</p>
                </div>
                <button onClick={e=>{e.stopPropagation();onDel(v.id)}} className="text-gray-200 hover:text-red-400 transition-colors text-xl ml-3 mt-0.5 flex-shrink-0">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalisiView({analisi, onAdd, onDel, onView}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">Analisi del Sangue</h2><p className="text-xs text-gray-400">{analisi.length} registrat{analisi.length===1?'a':'e'}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#be123c,#f43f5e)'}}>+ Nuova</button>
      </div>
      {analisi.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">🩸</p><p className="text-gray-400">Nessuna analisi registrata</p></div>
      ):(
        <div className="space-y-3">
          {analisi.map(a=>{
            const params=a.params||[], abn=params.filter(isAbn);
            return (
              <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 cursor-pointer hover:shadow-md transition-all" onClick={()=>onView(a)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-bold text-gray-800">{fmt(a.data)}</span>
                      {abn.length>0?<span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{background:'#fff1f2',color:'#be123c'}}>⚠ {abn.length} anomal{abn.length===1?'o':'i'}</span>:<span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{background:'#f0fdf4',color:'#166534'}}>✓ Ok</span>}
                      {a.allegati?.length>0&&<span className="text-xs text-blue-400 font-medium">📎 {a.allegati.length}</span>}
                    </div>
                    <p className="text-xs text-gray-400">{params.length} parametri · tocca per dettagli →</p>
                    {abn.length>0&&<p className="text-xs text-red-400 mt-1 truncate">↑↓ {abn.map(p=>p.n).join(', ')}</p>}
                  </div>
                  <button onClick={e=>{e.stopPropagation();onDel(a.id)}} className="text-gray-200 hover:text-red-400 transition-colors text-xl ml-3 flex-shrink-0">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VitaliView({vitali, onAdd, onDel}) {
  const [sel, setSel] = useState('Peso');
  const ti = VITALI.find(v=>v.n===sel);
  const dati = vitali.filter(v=>v.tipo===sel).slice().sort((a,b)=>a.data.localeCompare(b.data)).map(v=>({...v,df:fmt(v.data),val:parseFloat(v.valore)}));
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-lg font-black text-gray-800">Dati Vitali</h2><p className="text-xs text-gray-400">{vitali.length} misurazion{vitali.length===1?'e':'i'}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#7e22ce,#a855f7)'}}>+ Aggiungi</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{scrollbarWidth:'none'}}>
        {VITALI.map(v=>(
          <button key={v.n} onClick={()=>setSel(v.n)} className="whitespace-nowrap text-xs px-3.5 py-2 rounded-full font-bold flex-shrink-0 transition-all border"
            style={sel===v.n?{background:v.c,color:'white',borderColor:v.c}:{background:'white',color:'#6b7280',borderColor:'#e5e7eb'}}>
            {v.n}
          </button>
        ))}
      </div>
      {dati.length>1&&(
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{sel} ({ti?.u})</p>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={dati} margin={{top:5,right:10,left:-25,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5"/>
              <XAxis dataKey="df" tick={{fontSize:10,fill:'#9ca3af'}}/>
              <YAxis tick={{fontSize:10,fill:'#9ca3af'}} width={45}/>
              <Tooltip formatter={v=>[`${v} ${ti?.u}`,sel]} contentStyle={{fontSize:11,borderRadius:16,border:'none',boxShadow:'0 8px 24px rgba(0,0,0,0.12)'}}/>
              <Line type="monotone" dataKey="val" stroke={ti?.c} strokeWidth={2.5} dot={{r:4,fill:ti?.c,strokeWidth:0}} activeDot={{r:6}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {dati.length>0?(
        <div className="space-y-2">
          {[...dati].reverse().map(v=>(
            <div key={v.id} className="flex items-center bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-50">
              <span className="text-xs text-gray-400 flex-1">{v.df}</span>
              <span className="font-black text-gray-800">{v.valore}</span>
              <span className="text-xs text-gray-400 ml-1 mr-4">{ti?.u}</span>
              <button onClick={()=>onDel(v.id)} className="text-gray-200 hover:text-red-400 transition-colors">🗑</button>
            </div>
          ))}
        </div>
      ):(
        <div className="text-center py-12"><p className="text-4xl mb-3">📈</p><p className="text-gray-400">Nessun dato per "{sel}"</p></div>
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
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  useEffect(()=>{
    (async()=>{
      for (const [k,fn] of [['ht-visite',setVisite],['ht-analisi',setAnalisi],['ht-vitali',setVitali]]) {
        try { const r=await window.storage.get(k); if(r) fn(JSON.parse(r.value)); } catch(e){}
      }
      setLoading(false);
    })();
  },[]);

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

  const del = async (key, setter, id) => {
    try { await window.storage.delete(`ht-att-${id}`); } catch(e){}
    setter(prev=>{ const u=prev.filter(x=>x.id!==id); sv(key,u); return u; });
  };

  const TABS = [{id:'home',l:'Home',i:'🏠'},{id:'visite',l:'Visite',i:'👨‍⚕️'},{id:'analisi',l:'Analisi',i:'🩸'},{id:'vitali',l:'Vitali',i:'💓'}];

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{background:'#f8faff'}}>
      <div className="text-center"><p className="text-4xl mb-3">⏳</p><p className="text-gray-400">Caricamento...</p></div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{background:'#f8faff',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
      <div className="px-5 py-4 flex items-center gap-3 flex-shrink-0" style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{background:'rgba(255,255,255,0.2)'}}>🏥</div>
        <div><h1 className="font-black text-white text-base leading-tight">HealthTracker</h1><p className="text-blue-200 text-xs">Il tuo diario della salute</p></div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setModal('export')} title="Esporta CSV"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg hover:opacity-80 transition-opacity" style={{background:'rgba(255,255,255,0.15)'}}>📥</button>
          <div className="px-3 py-1.5 rounded-full" style={{background:'rgba(255,255,255,0.15)'}}>
            <p className="text-blue-100 text-xs font-semibold">{new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'})}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{paddingBottom:'80px'}}>
        <div className="px-4 py-5 max-w-lg mx-auto">
          {tab==='home'    && <Dashboard visite={visite} analisi={analisi} vitali={vitali}/>}
          {tab==='visite'  && <Visite visite={visite} onAdd={()=>setModal('visita')} onDel={id=>del('ht-visite',setVisite,id)} onView={v=>setModal({t:'viewV',d:v})}/>}
          {tab==='analisi' && <AnalisiView analisi={analisi} onAdd={()=>setModal('analisi')} onDel={id=>del('ht-analisi',setAnalisi,id)} onView={a=>setModal({t:'viewA',d:a})}/>}
          {tab==='vitali'  && <VitaliView vitali={vitali} onAdd={()=>setModal('vitale')} onDel={id=>del('ht-vitali',setVitali,id)}/>}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex bg-white" style={{borderTop:'1px solid #f3f4f6',boxShadow:'0 -8px 24px rgba(0,0,0,0.06)'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className="flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors">
            <span className="text-xl leading-none">{t.i}</span>
            <span className="text-xs font-bold" style={{color:tab===t.id?'#1e40af':'#9ca3af'}}>{t.l}</span>
            {tab===t.id&&<div className="w-1.5 h-1.5 rounded-full mt-0.5" style={{background:'#1e40af'}}/>}
          </button>
        ))}
      </div>

      {modal==='visita'   && <VisitaModal  onSave={d=>add('ht-visite',setVisite,d)}  onClose={()=>setModal(null)}/>}
      {modal==='analisi'  && <AnalisiModal onSave={d=>add('ht-analisi',setAnalisi,d)} onClose={()=>setModal(null)}/>}
      {modal==='vitale'   && <VitaleModal  onSave={d=>add('ht-vitali',setVitali,d)}  onClose={()=>setModal(null)}/>}
      {modal?.t==='viewV' && <ViewVisitaModal v={modal.d} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewA' && <ViewAnalisiModal a={modal.d} onClose={()=>setModal(null)}/>}
      {modal==='export'   && <ExportModal visite={visite} analisi={analisi} vitali={vitali} onClose={()=>setModal(null)}/>}
    </div>
  );
}
