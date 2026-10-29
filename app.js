const SUPABASE_URL="https://lhvbtioqqvvvprdmdhmi.supabase.co";
const SUPABASE_KEY="sb_publishable_G8_JOzVzUvv1FXmsF31boQ_WbhPFZdS";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let store=null,items=[],connected=false,errorMsg='';

const STORES={
  eurospin:{name:'EUROSPIN',cls:'euro',kind:'shop',label:'Eurospin'},
  esselunga:{name:'ESSELUNGA',cls:'essel',kind:'shop',label:'Esselunga'},
  varie:{name:'VARIE',cls:'varie',kind:'memo',label:'Varie'}
};
const isMemo=s=>STORES[s]&&STORES[s].kind==='memo';

let toastText='',toastTimer=null;

function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function showToast(m){toastText=m;render();clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toastText='';render()},2000)}
function toast(){return toastText?`<div class="toast">${esc(toastText)}</div>`:''}

/* ---------- ordinamento locale (solo supermercati) ---------- */
function orderKey(s){return 'spesa_local_order_'+s}
function getOrder(s){try{return JSON.parse(localStorage.getItem(orderKey(s))||'[]').map(Number)}catch(e){return[]}}
function saveOrder(s,ids){try{localStorage.setItem(orderKey(s),JSON.stringify(ids.map(Number)))}catch(e){}}
function orderedList(s){
  const source=items.filter(x=>x.store===s);
  if(isMemo(s))return source.slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const valid=new Set(source.map(x=>Number(x.id))),
    saved=getOrder(s).filter(id=>valid.has(id)),
    known=new Set(saved),
    incoming=source.filter(x=>!known.has(Number(x.id))).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)),
    merged=[...saved,...incoming.map(x=>Number(x.id))],
    map=new Map(source.map(x=>[Number(x.id),x]));
  saveOrder(s,merged);
  return merged.map(id=>map.get(id)).filter(Boolean);
}
function moveSelected(delta){
  const ids=orderedList(store).map(x=>Number(x.id)),
    selected=new Set(orderedList(store).filter(x=>x.checked).map(x=>Number(x.id)));
  if(!selected.size)return;
  if(delta<0){for(let i=1;i<ids.length;i++){if(selected.has(ids[i])&&!selected.has(ids[i-1]))[ids[i-1],ids[i]]=[ids[i],ids[i-1]]}}
  else{for(let i=ids.length-2;i>=0;i--){if(selected.has(ids[i])&&!selected.has(ids[i+1]))[ids[i],ids[i+1]]=[ids[i+1],ids[i]]}}
  saveOrder(store,ids);render();
}

/* ---------- suggerimenti ---------- */
function suggestions(q){
  q=(q||'').trim().toLowerCase();if(!q)return[];
  const seen=new Set(),out=[];
  items.forEach(x=>{
    if(isMemo(store)!==isMemo(x.store))return;
    const n=String(x.item||'').trim(),k=n.toLowerCase();
    if(n&&k.includes(q)&&!seen.has(k)){seen.add(k);out.push(n)}
  });
  return out.slice(0,6);
}
function updateSuggestions(){
  const e=document.getElementById('newitem'),b=document.getElementById('suggestions');
  if(!e||!b)return;
  const v=suggestions(e.value);
  b.innerHTML=v.map(x=>`<button data-v="${esc(x)}" onclick="pickSuggestion(this.dataset.v)">${esc(x)}</button>`).join('');
  b.style.display=v.length?'grid':'none';
}
function pickSuggestion(v){
  const e=document.getElementById('newitem');
  e.value=v;document.getElementById('suggestions').style.display='none';e.focus();
}

/* ---------- dati ---------- */
async function loadItems(){
  const {data,error}=await db.from('shopping_items').select('id,store,item,checked,created_at').order('created_at',{ascending:true});
  if(error){errorMsg=error.message;connected=false}else{items=data||[];errorMsg='';connected=true}
  render();
}
async function addItem(){
  const e=document.getElementById('newitem'),v=e&&e.value.trim();
  if(!v||!store)return;
  e.value='';
  const {error}=await db.from('shopping_items').insert({store,item:v,checked:false});
  if(error){errorMsg=error.message;render()}
  const b=document.getElementById('suggestions');if(b)b.style.display='none';
}
async function toggle(id,v){
  const {error}=await db.from('shopping_items').update({checked:!v}).eq('id',id);
  if(error){errorMsg=error.message;render()}
}
async function removeItem(id){
  const {error}=await db.from('shopping_items').delete().eq('id',id);
  if(error){errorMsg=error.message;render()}
}
async function clearChecked(){
  const {error}=await db.from('shopping_items').delete().eq('store',store).eq('checked',true);
  if(error){errorMsg=error.message;render()}
}
async function transferChecked(){
  const target=store==='eurospin'?'esselunga':'eurospin',
    sel=items.filter(x=>x.store===store&&x.checked);
  if(!sel.length)return;
  const {error}=await db.from('shopping_items').update({store:target,checked:false}).in('id',sel.map(x=>x.id));
  if(error){errorMsg=error.message;render();return}
  await loadItems();
  showToast(`${sel.length} ${sel.length===1?'prodotto trasferito':'prodotti trasferiti'} ad ${STORES[target].label}`);
}

/* ---------- viste ---------- */
function status(){
  return `<div class="status ${connected?'ok':'bad'}"><i></i>${connected?'Sincronizzato':esc(errorMsg||'Connessione...')}</div>`;
}

function home(){
  const cards=Object.entries(STORES).map(([id,s])=>{
    const n=isMemo(id)?items.filter(x=>x.store===id).length:items.filter(x=>x.store===id&&!x.checked).length;
    const txt=isMemo(id)?`${n} ${n===1?'voce':'voci'} nel memo`:`${n} ${n===1?'prodotto':'prodotti'} nella lista`;
    return `<button class="store ${s.cls}" onclick="openStore('${id}')">
      <div><div class="brand">${s.name}</div><div class="count">${txt}</div></div>
      <span class="chev">›</span></button>`;
  }).join('');
  return `<div class="head"><img class="home-icon" src="./home-icon.png" alt="Icona spesa"><h2>La nostra spesa</h2><p>Scegli dove andare</p></div>
    <div class="stores">${cards}</div>${status()}<div class="disclaimer">registered da vinsDOTit v.2.2</div>${toast()}`;
}

function openStore(id){store=id;render();window.scrollTo(0,0)}
function goHome(){store=null;render()}

function itemsHtml(list,memo){
  if(!list.length)return `<div class="empty"><div class="empty-ico">${memo?'📝':'🛒'}</div>${memo?'Memo vuoto':'Lista vuota'}<br><small>${memo?'Scrivi la prima voce.':'Aggiungi il primo prodotto.'}</small></div>`;
  return list.map(x=>memo
    ?`<div class="item memo"><span class="dot"></span><span class="txt">${esc(x.item)}</span><button class="trash" aria-label="Elimina" onclick="removeItem(${x.id})">✕</button></div>`
    :`<div class="item ${x.checked?'checked':''}"><button class="check" aria-label="Seleziona" onclick="toggle(${x.id},${x.checked})"></button><span class="txt" onclick="toggle(${x.id},${x.checked})">${esc(x.item)}</span><button class="trash" aria-label="Elimina" onclick="removeItem(${x.id})">✕</button></div>`
  ).join('');
}

function list(){
  const s=STORES[store],memo=isMemo(store),rows=orderedList(store),
    selected=rows.filter(x=>x.checked).length,
    target=store==='eurospin'?'Esselunga':'Eurospin';
  const actions=(!memo&&selected)?`<div class="selected-actions">
      <div class="reorder-actions"><button onclick="moveSelected(1)" aria-label="Sposta selezionati in basso">↓</button><button onclick="moveSelected(-1)" aria-label="Sposta selezionati in alto">↑</button></div>
      <button class="clear" onclick="clearChecked()">Elimina acquistati (${selected})</button>
      <button class="transfer" onclick="transferChecked()">Trasferisci ad ${target}</button></div>`:'';
  return `<div class="theme-${s.cls}">
    <header class="top"><button onclick="goHome()" class="round" aria-label="Indietro">‹</button>
      <div class="title"><p>${memo?'MEMO':'LISTA SPESA'}</p><h1>${s.name}</h1></div>
      <button onclick="loadItems()" class="round" aria-label="Aggiorna">↻</button></header>
    <div class="card"><div class="add"><input id="newitem" autocomplete="off" enterkeyhint="done" placeholder="${memo?'Scrivi una voce...':'Aggiungi un prodotto...'}" oninput="updateSuggestions()" onkeydown="if(event.key==='Enter')addItem()"><button class="plus" aria-label="Aggiungi" onclick="addItem()">+</button></div><div id="suggestions" class="suggestions"></div></div>
    <div class="items">${itemsHtml(rows,memo)}</div>${actions}${status()}${toast()}</div>`;
}

function render(){
  const old=document.getElementById('newitem'),
    keep=old?{v:old.value,f:document.activeElement===old}:null,
    sy=window.scrollY;
  document.getElementById('app').innerHTML=`<div class="app">${store?list():home()}</div>`;
  const e=document.getElementById('newitem');
  if(e&&keep){e.value=keep.v;if(keep.f)e.focus({preventScroll:true});updateSuggestions()}
  window.scrollTo(0,sy);
}

db.channel('shopping-items-live')
  .on('postgres_changes',{event:'*',schema:'public',table:'shopping_items'},()=>loadItems())
  .subscribe(v=>{connected=v==='SUBSCRIBED';render()});
render();loadItems();
