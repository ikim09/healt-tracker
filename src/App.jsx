import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import { t, tv, tTab, setLang, LANGS, locale } from "./i18n";
import { PARAMS } from "./params";

const APP_VERSION = "1.0.2";

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
      {opts.map(o=><option key={o} value={o}>{tv(o)}</option>)}
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
  const MAX = 4;
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
        {files.length<MAX&&<button type="button" onClick={()=>ref.current?.click()} className="text-xs text-blue-500 font-bold hover:text-blue-700">{t('add_file')}</button>}
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
          <p className="text-xs text-gray-400">{t('tap_add')}</p>
          <p className="text-xs text-gray-300 mt-0.5">{t('file_hint')}</p>
        </div>
      )}
    </div>
  );
}

function AttachmentViewer({file, onClose}) {
  const isImg = file.type.startsWith('image/');
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{background:'rgba(0,0,0,0.7)'}}>
      <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg" style={{maxHeight:'90vh',display:'flex',flexDirection:'column',paddingBottom:'env(safe-area-inset-bottom)'}}>
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
            ⬇️ {t('download')} {file.name}
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
function VisitaModal({iniziale, onSave, onClose}) {
  const [f, sf] = useState(iniziale
    ? {...iniziale, diagnosi:iniziale.diagnosi||'', note:iniziale.note||'', allegati:[]}
    : {data:'',medico:'',spec:'Medicina generale',diagnosi:'',note:'',allegati:[]});
  const [caricando, setCaricando] = useState(!!iniziale?.allegati?.length);
  const s = (k,v) => sf(p=>({...p,[k]:v}));
  const ok = f.data && f.medico.trim();

  // In modifica: recupera gli allegati completi per poterli togliere o aggiungere
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

  return (
    <Modal title={iniziale?t('edit_visit'):t('new_visit')} onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?(iniziale?t('save_changes'):t('save_visit')):t('need_visit')}>
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>s('data',e.target.value)}/>
      <Inp lbl={t('doctor_l')} placeholder={t('doctor_ph')} value={f.medico} onChange={e=>s('medico',e.target.value)}/>
      <Sel lbl={t('spec_l')} opts={SPEC} value={f.spec} onChange={e=>s('spec',e.target.value)}/>
      <Inp lbl={t('diag_l')} placeholder={t('diag_ph')} value={f.diagnosi} onChange={e=>s('diagnosi',e.target.value)}/>
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

function AnalisiModal({onSave, onClose}) {
  const [f, sf] = useState({data:'',note:'',params:[],allegati:[]});
  const [sp, setSp] = useState('');
  const [vp, setVp] = useState('');
  const [dp, setDp] = useState(''); // data del singolo valore, se diversa da quella dell'analisi
  const mkParam = (name,val,data) => {
    const def=PARAMS.find(p=>p.n===name);
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
    <Modal title={t('new_test')} onClose={onClose} onSave={ok?doSave:null}
      saveLabel={ok?t('save_test'):t('need_test')} saveBg="linear-gradient(135deg,#be123c,#f43f5e)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <ScansionaReferto onFound={ps=>sf(prev=>{
        const nomi=new Set(ps.map(p=>p.n));
        return {...prev, params:[...prev.params.filter(p=>!nomi.has(p.n)), ...ps]};
      })}/>
      <Txt lbl={t('notes_l')} placeholder={t('test_notes_ph')} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
      <div className="mb-3">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t('add_param')}</label>
        <div className="flex gap-2 mb-2">
          <select value={sp} onChange={e=>setSp(e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-400 min-w-0">
            <option value="">{t('choose_param')}</option>
            {PARAMS.filter(p=>!f.params.find(fp=>fp.n===p.n)).map(p=><option key={p.n} value={p.n}>{tv(p.n)}</option>)}
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
      <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>
    </Modal>
  );
}

function VitaleModal({onSave, onClose}) {
  const [f, sf] = useState({data:'',tipo:VITALI[0].n,valore:'',massima:'',minima:'',note:''});
  const ti = VITALI.find(v=>v.n===f.tipo);
  const isP = f.tipo==='Pressione';
  const pf = s => parseFloat(String(s).replace(',','.'));
  const num = pf(f.valore), nMax = pf(f.massima), nMin = pf(f.minima);
  const ok = f.data && (isP ? (f.massima && f.minima && !isNaN(nMax) && !isNaN(nMin)) : (f.valore && !isNaN(num)));
  const doSave = () => onSave(isP
    ? {data:f.data,tipo:f.tipo,massima:nMax,minima:nMin,note:f.note}
    : {data:f.data,tipo:f.tipo,valore:num,note:f.note});
  return (
    <Modal title={t('new_vital')} onClose={onClose} onSave={ok?doSave:null} saveLabel={t('save')} saveBg="linear-gradient(135deg,#7e22ce,#a855f7)">
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

function AllenamentoModal({onSave, onClose}) {
  const [f, sf] = useState({data:'',tipo:SPORT[0].n,durata:'',note:''});
  const num = parseFloat(String(f.durata).replace(',','.'));
  const ok = f.data && f.durata && !isNaN(num) && num>0;
  return (
    <Modal title={t('new_workout')} onClose={onClose} onSave={ok?()=>onSave({...f,durata:Math.round(num)}):null}
      saveLabel={ok?t('save_workout'):t('need_workout')} saveBg="linear-gradient(135deg,#15803d,#22c55e)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Sel lbl={t('activity_l')} opts={SPORT.map(s=>s.n)} value={f.tipo} onChange={e=>sf(p=>({...p,tipo:e.target.value}))}/>
      <Inp lbl={t('duration_l')} type="text" inputMode="numeric" placeholder={t('duration_ph')} value={f.durata} onChange={e=>sf(p=>({...p,durata:e.target.value}))}/>
      <Txt lbl={t('notes_l')} placeholder={t('workout_notes_ph')} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
    </Modal>
  );
}

function AllenamentiView({allenamenti, onAdd, onDel}) {
  const d = new Date();
  const lun = new Date(d); lun.setDate(d.getDate()-((d.getDay()+6)%7));
  const lunStr = `${lun.getFullYear()}-${String(lun.getMonth()+1).padStart(2,'0')}-${String(lun.getDate()).padStart(2,'0')}`;
  const sett = allenamenti.filter(a=>a.data>=lunStr);
  const minSett = sett.reduce((s,a)=>s+(a.durata||0),0);
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
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{fmt(a.data)}</p>
                {a.note&&<p className="text-sm text-gray-500 mt-0.5 truncate">{a.note}</p>}
              </div>
              <button onClick={()=>onDel(a.id)} className="text-gray-200 hover:text-red-400 transition-colors text-xl flex-shrink-0">🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RicettaModal({onSave, onClose}) {
  const [f, sf] = useState({data:'',descrizione:'',note:'',usata:false,allegati:[]});
  const ok = f.data && f.descrizione.trim();
  return (
    <Modal title={t('new_rx')} onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?t('save_rx'):t('need_rx')} saveBg="linear-gradient(135deg,#0e7490,#06b6d4)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Inp lbl={t('desc_l')} placeholder={t('desc_ph')} value={f.descrizione} onChange={e=>sf(p=>({...p,descrizione:e.target.value}))}/>
      <Txt lbl={t('notes_l')} placeholder={t('rx_notes_ph')} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
      <AttachmentPicker files={f.allegati} onChange={v=>sf(p=>({...p,allegati:v}))}/>
    </Modal>
  );
}

function RicettaCard({r, onToggle, onDel}) {
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
          <button onClick={()=>onDel(r.id)} className="text-gray-200 hover:text-red-400 transition-colors text-xl">🗑</button>
        </div>
      </div>
    </div>
  );
}

function RicetteView({ricette, onAdd, onToggle, onDel}) {
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
              <div className="space-y-3">{daUsare.map(r=><RicettaCard key={r.id} r={r} onToggle={onToggle} onDel={onDel}/>)}</div>
            </div>
          )}
          {usate.length>0&&(
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">{t('used_s',usate.length)}</p>
              <div className="space-y-3">{usate.map(r=><RicettaCard key={r.id} r={r} onToggle={onToggle} onDel={onDel}/>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TerapiaModal({onSave, onClose}) {
  const oggi = new Date().toISOString().slice(0,10);
  const [f, sf] = useState({inizio:oggi,fine:'',farmaco:'',dose:'',frequenza:FREQ[0],note:''});
  const ok = f.inizio && f.farmaco.trim();
  return (
    <Modal title={t('new_therapy')} onClose={onClose} onSave={ok?()=>onSave({...f,data:f.inizio}):null}
      saveLabel={ok?t('save_therapy'):t('need_therapy')} saveBg="linear-gradient(135deg,#0f766e,#14b8a6)">
      <Inp lbl={t('drug_l')} placeholder={t('drug_ph')} value={f.farmaco} onChange={e=>sf(p=>({...p,farmaco:e.target.value}))}/>
      <Inp lbl={t('dose_l')} placeholder={t('dose_ph')} value={f.dose} onChange={e=>sf(p=>({...p,dose:e.target.value}))}/>
      <Sel lbl={t('freq_l')} opts={FREQ} value={f.frequenza} onChange={e=>sf(p=>({...p,frequenza:e.target.value}))}/>
      <div className="grid grid-cols-2 gap-3">
        <Inp lbl={t('start_l')} type="date" value={f.inizio} onChange={e=>sf(p=>({...p,inizio:e.target.value}))}/>
        <Inp lbl={t('end_l')} type="date" value={f.fine} onChange={e=>sf(p=>({...p,fine:e.target.value}))}/>
      </div>
      <p className="text-xs text-gray-300 -mt-1 mb-3">{t('end_hint')}</p>
      <Txt lbl={t('notes_l')} placeholder={t('therapy_notes_ph')} value={f.note} onChange={e=>sf(p=>({...p,note:e.target.value}))}/>
    </Modal>
  );
}

function TerapiaCard({x, onDel, conclusa}) {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-50 flex items-start gap-3 ${conclusa?'opacity-70':''}`}
      style={{borderLeft:`3px solid ${conclusa?'#d1d5db':'#14b8a6'}`}}>
      <span className="text-2xl">💊</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-bold ${conclusa?'text-gray-400':'text-gray-800'}`}>{x.farmaco}</p>
          {x.dose&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:'#f0fdfa',color:'#0f766e'}}>{x.dose}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{tv(x.frequenza)}</p>
        <p className="text-xs text-gray-400 mt-0.5">{fmt(x.inizio)}{x.fine?` → ${fmt(x.fine)}`:` → ${t('ongoing')}`}</p>
        {x.note&&<p className="text-sm text-gray-500 mt-1">{x.note}</p>}
      </div>
      <button onClick={()=>onDel(x.id)} className="text-gray-200 hover:text-red-400 transition-colors text-xl flex-shrink-0">🗑</button>
    </div>
  );
}

function TerapieView({terapie, onAdd, onDel}) {
  const oggi = new Date().toISOString().slice(0,10);
  const inCorso = terapie.filter(x=>!x.fine||x.fine>=oggi);
  const concluse = terapie.filter(x=>x.fine&&x.fine<oggi);
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('therapies_title')}</h2><p className="text-xs text-gray-400">{t('therapies_count',inCorso.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#0f766e,#14b8a6)'}}>{t('new_f')}</button>
      </div>
      {terapie.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">💊</p><p className="text-gray-400 px-8">{t('no_therapies')}</p></div>
      ):(
        <div>
          {inCorso.length>0&&(
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-wider mb-2" style={{color:'#0f766e'}}>{t('ongoing_s',inCorso.length)}</p>
              <div className="space-y-3">{inCorso.map(x=><TerapiaCard key={x.id} x={x} onDel={onDel}/>)}</div>
            </div>
          )}
          {concluse.length>0&&(
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">{t('finished_s',concluse.length)}</p>
              <div className="space-y-3">{concluse.map(x=><TerapiaCard key={x.id} x={x} onDel={onDel} conclusa/>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotaModal({onSave, onClose}) {
  const oggi = new Date().toISOString().slice(0,10);
  const [f, sf] = useState({data:oggi,titolo:'',testo:''});
  const ok = f.data && f.titolo.trim();
  return (
    <Modal title={t('new_note')} onClose={onClose} onSave={ok?()=>onSave(f):null}
      saveLabel={ok?t('save_note'):t('need_note')} saveBg="linear-gradient(135deg,#b45309,#f59e0b)">
      <Inp lbl={t('date_l')} type="date" value={f.data} onChange={e=>sf(p=>({...p,data:e.target.value}))}/>
      <Inp lbl={t('title_l')} placeholder={t('title_ph')} value={f.titolo} onChange={e=>sf(p=>({...p,titolo:e.target.value}))}/>
      <Txt lbl={t('text_l')} placeholder={t('text_ph')} rows={6} value={f.testo} onChange={e=>sf(p=>({...p,testo:e.target.value}))}/>
    </Modal>
  );
}

function ViewNotaModal({n, onClose}) {
  return (
    <Modal title={`📝 ${n.titolo}`} onClose={onClose}>
      <p className="text-xs text-gray-400 mb-3">{fmt(n.data)}</p>
      {n.testo
        ? <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{n.testo}</p>
        : <p className="text-sm text-gray-300 italic">{t('note_empty')}</p>}
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
          <p className={`font-bold ${n.archiviata?'text-gray-400':'text-gray-800'}`}>{n.titolo}</p>
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
      {v.diagnosi&&<div className="bg-gray-50 rounded-2xl p-3 mb-3"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('diag_l')}</p><p className="text-sm text-gray-700">{v.diagnosi}</p></div>}
      {v.note&&<div className="bg-gray-50 rounded-2xl p-3 mb-2"><p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">{t('notes_l')}</p><p className="text-sm text-gray-600 italic">{v.note}</p></div>}
      <InlineAttachments allegati={v.allegati} recordId={v.id}/>
    </Modal>
  );
}

function ViewAnalisiModal({a, onClose}) {
  const params=a.params||[], totAbn=params.filter(isAbn).length;
  return (
    <Modal title={t('test_of',fmt(a.data))} onClose={onClose}>
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
      .map(x=>({id:'t'+x.id,tab:'terapie',i:'💊',tit:x.farmaco,sub:x.dose,data:x.inizio})),
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
    {id:'sport',i:'💪',c:'#f0fdf4'},
    {id:'ricette',i:'📋',c:'#ecfeff'},
    {id:'note',i:'📝',c:'#fffbeb'},
    {id:'terapie',i:'💊',c:'#f0fdfa'},
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

function SettingsModal({lang, onLang, promemoria, onPromemoria, onExport, onClose}) {
  const [info, setInfo] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [msg, setMsg] = useState(null);
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
  const expVisite = () => {
    const h=[t('h_date'),t('h_doctor'),t('h_spec'),t('h_diag'),t('h_notes'),t('h_nfiles')];
    const r=visite.map(v=>[fmt(v.data),v.medico,tv(v.spec),v.diagnosi||'',v.note||'',(v.allegati||[]).length]);
    dlCSV('visite_mediche.csv',mkCSV(h,r));
  };
  const expAnalisi = () => {
    const h=[t('h_date'),t('h_param'),t('h_value'),t('h_unit'),t('h_refmin'),t('h_refmax'),t('h_abn'),t('h_notes')];
    const r=[];
    analisi.forEach(a=>(a.params||[]).forEach(p=>r.push([fmt(p.d||a.data),tv(p.n),p.v,p.u,p.min??'',p.max??'',isAbn(p)?t('yes'):t('no'),a.note||''])));
    dlCSV('analisi_sangue.csv',mkCSV(h,r));
  };
  const expVitali = () => {
    const h=[t('h_date'),t('h_type'),t('h_value'),t('h_unit'),t('h_notes')];
    const r=vitali.map(v=>[fmt(v.data),tv(v.tipo),v.tipo==='Pressione'?`${v.massima??''}/${v.minima??''}`:v.valore,VITALI.find(x=>x.n===v.tipo)?.u||'',v.note||'']);
    dlCSV('dati_vitali.csv',mkCSV(h,r));
  };
  const expAll = () => { expVisite(); setTimeout(expAnalisi,350); setTimeout(expVitali,700); };
  const items=[
    {l:`👨‍⚕️ ${t('visits_title')}`,c:visite.length,f:expVisite,bg:'#eff6ff',col:'#1e40af'},
    {l:`🩸 ${t('tests_title')}`,c:analisi.length,f:expAnalisi,bg:'#fff1f2',col:'#be123c'},
    {l:`💓 ${t('vitals_title')}`,c:vitali.length,f:expVitali,bg:'#fdf4ff',col:'#7e22ce'},
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
            <span className="text-xl">⬇️</span>
          </button>
        ))}
      </div>
      <button onClick={expAll} disabled={tot===0}
        className="w-full py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40"
        style={{background:'linear-gradient(135deg,#1e3a8a,#2563eb)'}}>
        {t('export_all')}
      </button>
      <p className="text-xs text-gray-300 text-center mt-3">{t('export_note')}</p>
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
        {[{v:visite.length,l:t('stat_visite'),bg:'#eff6ff',c:'#1e40af',i:'👨‍⚕️'},{v:analisi.length,l:t('stat_analisi'),bg:'#fff1f2',c:'#be123c',i:'🩸'},{v:vitali.length,l:t('stat_mis'),bg:'#fdf4ff',c:'#7e22ce',i:'💓'},{v:abn,l:abn>0?t('stat_anom'):t('stat_ok'),bg:abn>0?'#fffbeb':'#f0fdf4',c:abn>0?'#92400e':'#166534',i:abn>0?'⚠️':'✅'}].map(s=>(
          <div key={s.l} className="rounded-2xl p-4" style={{background:s.bg}}>
            <div className="text-xl mb-1">{s.i}</div>
            <div className="text-3xl font-black" style={{color:s.c}}>{s.v}</div>
            <div className="text-xs font-semibold mt-0.5" style={{color:s.c,opacity:.7}}>{s.l}</div>
          </div>
        ))}
      </div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('recent')}</p>
      <div className="space-y-3">
        {lv&&(
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'#eff6ff',color:'#1e40af'}}>{tv(lv.spec)}</span>
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
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'#fff1f2',color:'#be123c'}}>{t('last_test')}</span>
              {la.allegati?.length>0&&<span className="text-xs text-blue-300">📎 {la.allegati.length}</span>}
              <span className="ml-auto text-xs text-gray-400">{fmt(la.data)}</span>
            </div>
            <p className="font-bold text-gray-800 text-sm">{t('params_n',(la.params||[]).length)}</p>
            <p className={`text-xs mt-0.5 ${abn>0?'text-red-500':'text-green-500'}`}>{abn>0?t('out_range',abn):t('all_ok')}</p>
          </div>
        )}
        {(lp||lfc)&&(
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('last_vitals')}</p>
            <div className="flex gap-5">
              {lp&&<div><p className="text-2xl font-black text-blue-600">{lp.valore} <span className="text-sm font-normal text-gray-400">kg</span></p><p className="text-xs text-gray-400">{tv('Peso')} · {fmt(lp.data)}</p></div>}
              {lfc&&<div><p className="text-2xl font-black text-pink-500">{lfc.valore} <span className="text-sm font-normal text-gray-400">bpm</span></p><p className="text-xs text-gray-400">{t('hr_short')} · {fmt(lfc.data)}</p></div>}
            </div>
          </div>
        )}
        {!lv&&!la&&!lp&&(
          <div className="text-center py-16">
            <p className="text-6xl mb-4">🏥</p>
            <p className="text-gray-400 font-semibold">{t('empty_title')}</p>
            <p className="text-gray-300 text-sm mt-1">{t('empty_sub')}</p>
          </div>
        )}
      </div>
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
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('visits_title')}</h2><p className="text-xs text-gray-400">{t('visits_count',visite.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#1e40af,#3b82f6)'}}>{t('new_f')}</button>
      </div>
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
  const disponibili = PARAMS.map(p=>p.n).filter(n=>conteggi[n]>=2);
  const [sel, setSel] = useState(disponibili[0]||'');
  if (disponibili.length===0) return null;
  const attivo = disponibili.includes(sel) ? sel : disponibili[0];
  const def = PARAMS.find(p=>p.n===attivo);

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
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-lg font-black text-gray-800">{t('tests_title')}</h2><p className="text-xs text-gray-400">{t('tests_count',analisi.length)}</p></div>
        <button onClick={onAdd} className="text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-md hover:opacity-90" style={{background:'linear-gradient(135deg,#be123c,#f43f5e)'}}>{t('new_f')}</button>
      </div>
      {analisi.length>1 && <AndamentoAnalisi analisi={analisi}/>}
      {analisi.length===0?(
        <div className="text-center py-16"><p className="text-5xl mb-3">🩸</p><p className="text-gray-400">{t('no_tests')}</p></div>
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
                <span className="text-xs text-gray-400 ml-1 mr-4">{ti?.u}</span>
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
      for (const [k,fn] of [['ht-visite',setVisite],['ht-analisi',setAnalisi],['ht-allenamenti',setAllenamenti],['ht-ricette',setRicette],['ht-note',setNote],['ht-terapie',setTerapie]]) {
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
    const allFull = item.allegati||[];
    const allegatiMeta = allFull.map(({id,name,type,size})=>({id,name,type,size}));
    const record = {...item, allegati:allegatiMeta};
    try {
      if (allFull.length>0) await window.storage.set(`ht-att-${record.id}`, JSON.stringify(allFull));
      else await window.storage.delete(`ht-att-${record.id}`);
    } catch(e){}
    setter(prev=>{ const u=prev.map(x=>x.id===record.id?record:x).sort((a,b)=>b.data.localeCompare(a.data)); sv(key,u); return u; });
    setModal(null);
  };

  const del = async (key, setter, id) => {
    try { await window.storage.delete(`ht-att-${id}`); } catch(e){}
    setter(prev=>{ const u=prev.filter(x=>x.id!==id); sv(key,u); return u; });
  };

  const toggleRicetta = id => setRicette(prev=>{ const u=prev.map(r=>r.id===id?{...r,usata:!r.usata}:r); sv('ht-ricette',u); return u; });
  const toggleNota = id => setNote(prev=>{ const u=prev.map(n=>n.id===id?{...n,archiviata:!n.archiviata}:n); sv('ht-note',u); return u; });

  // Riprogramma i promemoria quando cambiano le visite o l'impostazione
  useEffect(()=>{
    if (loading || !promemoria) return;
    (async()=>{
      const { aggiornaPromemoria } = await import('./promemoria');
      await aggiornaPromemoria(visite, true);
    })();
  },[visite, promemoria, loading]);

  const cambiaPromemoria = async attiva => {
    const { notificheDisponibili, chiediPermesso, aggiornaPromemoria } = await import('./promemoria');
    if (!attiva) {
      setPromemoria(false);
      try { await window.storage.set('ht-promemoria','0'); } catch(e){}
      await aggiornaPromemoria([], false);
      return null;
    }
    if (!(await notificheDisponibili())) return t('notif_unavailable');
    if (!(await chiediPermesso())) return t('notif_denied');
    setPromemoria(true);
    try { await window.storage.set('ht-promemoria','1'); } catch(e){}
    const r = await aggiornaPromemoria(visite, true);
    return r.n>0 ? t('notif_set',r.n) : t('notif_none');
  };

  const TABS = [{id:'home',i:'🏠'},{id:'visite',i:'👨‍⚕️'},{id:'analisi',i:'🩸'},{id:'vitali',i:'💓'},{id:'altro',i:'⋯'}];
  const SEZ_ALTRO = ['sport','ricette','note','terapie'];

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{background:'#f8faff'}}>
      <div className="text-center"><p className="text-4xl mb-3">⏳</p><p className="text-gray-400">{t('loading')}</p></div>
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
          {tab==='home'    && <Dashboard visite={visite} analisi={analisi} vitali={vitali}/>}
          {tab==='visite'  && <Visite visite={visite} onAdd={()=>setModal('visita')} onDel={id=>del('ht-visite',setVisite,id)} onView={v=>setModal({t:'viewV',d:v})}/>}
          {tab==='analisi' && <AnalisiView analisi={analisi} onAdd={()=>setModal('analisi')} onDel={id=>del('ht-analisi',setAnalisi,id)} onView={a=>setModal({t:'viewA',d:a})}/>}
          {tab==='vitali'  && <VitaliView vitali={vitali} onAdd={()=>setModal('vitale')} onDel={id=>del('ht-vitali',setVitali,id)}/>}
          {tab==='sport'   && <AllenamentiView allenamenti={allenamenti} onAdd={()=>setModal('allenamento')} onDel={id=>del('ht-allenamenti',setAllenamenti,id)}/>}
          {tab==='ricette' && <RicetteView ricette={ricette} onAdd={()=>setModal('ricetta')} onToggle={toggleRicetta} onDel={id=>del('ht-ricette',setRicette,id)}/>}
          {tab==='note'    && <NoteView note={note} onAdd={()=>setModal('nota')} onArch={toggleNota} onDel={id=>del('ht-note',setNote,id)} onView={n=>setModal({t:'viewN',d:n})}/>}
          {tab==='terapie' && <TerapieView terapie={terapie} onAdd={()=>setModal('terapia')} onDel={id=>del('ht-terapie',setTerapie,id)}/>}
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
      {modal==='analisi'  && <AnalisiModal onSave={d=>add('ht-analisi',setAnalisi,d)} onClose={()=>setModal(null)}/>}
      {modal==='vitale'   && <VitaleModal  onSave={d=>add('ht-vitali',setVitali,d)}  onClose={()=>setModal(null)}/>}
      {modal==='allenamento' && <AllenamentoModal onSave={d=>add('ht-allenamenti',setAllenamenti,d)} onClose={()=>setModal(null)}/>}
      {modal==='ricetta'  && <RicettaModal onSave={d=>add('ht-ricette',setRicette,d)} onClose={()=>setModal(null)}/>}
      {modal==='nota'     && <NotaModal onSave={d=>add('ht-note',setNote,d)} onClose={()=>setModal(null)}/>}
      {modal==='terapia'  && <TerapiaModal onSave={d=>add('ht-terapie',setTerapie,d)} onClose={()=>setModal(null)}/>}
      {modal==='altro'    && <AltroModal onGo={id=>{setTab(id);setModal(null);}} onClose={()=>setModal(null)}/>}
      {modal==='search'   && <SearchModal dati={{visite,analisi,note,ricette,terapie,allenamenti,vitali}} onGo={id=>{setTab(id);setModal(null);}} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewN' && <ViewNotaModal n={modal.d} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewV' && <ViewVisitaModal v={modal.d} onEdit={v=>setModal({t:'editV',d:v})} onClose={()=>setModal(null)}/>}
      {modal?.t==='viewA' && <ViewAnalisiModal a={modal.d} onClose={()=>setModal(null)}/>}
      {modal==='export'   && <ExportModal visite={visite} analisi={analisi} vitali={vitali} onClose={()=>setModal(null)}/>}
      {modal==='settings' && <SettingsModal lang={lang} onLang={changeLang} promemoria={promemoria} onPromemoria={cambiaPromemoria} onExport={()=>setModal('export')} onClose={()=>setModal(null)}/>}
    </div>
  );
}
