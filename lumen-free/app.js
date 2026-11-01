import { uid, normalizeUrl, loadState, mutateState } from './store.js';
import { parseImport, mergeImport, exportJson, exportHtml, exportCsv } from './import-export.js';
import { createFocusDashboard } from './focus.js';
import { normalizeFocus } from './focus-state.js';

const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canonical = value => JSON.stringify(value, function(key,item) {if(key==='updatedAt')return undefined;if(item && !Array.isArray(item) && typeof item==='object')return Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]]));return item;});
const contentSignature = value => canonical({pages:value.pages.map(p=>({...p,boards:p.boards.map(({collapsed,...b})=>b)})),trash:value.trash});
const paths = {
  search:'m21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  more:'M5 12h.01M12 12h.01M19 12h.01', plus:'M12 5v14M5 12h14',
  import:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', export:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  incognito:'M3 10h18M6 10l2-6h8l2 6M4 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0m10 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0m-4 0h4',
  duplicates:'M8 8h12v12H8zM4 16V4h12', trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  privacy:'m3 3 18 18M10 5c6-1 11 7 11 7s-1 2-4 4M6 6c-3 2-5 6-5 6s5 8 12 7m-4-10a4 4 0 0 0 6 6',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  undo:'M9 4 3 10l6 6M3 10h10a7 7 0 0 1 7 7v3', redo:'m15 4 6 6-6 6m6-6H11a7 7 0 0 0-7 7v3',
  edit:'m16 3 5 5-12 12-6 1 1-6zM14 5l5 5', open:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  arrow:'m9 5 7 7-7 7', chevron:'m6 9 6 6 6-6', check:'m5 12 4 4L19 6', grip:'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  board:'M3 3h8v8H3zm10 0h8v5h-8zm0 7h8v11h-8zM3 13h8v8H3z', link:'m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0'
};
const icon = (name, size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.more}"/></svg>`;
let state, search = '', selectionMode = false, selected = new Set(), dragged = null, undoStack = [], redoStack = [], externalRefresh = false, pendingWrites = 0;
const focusDashboard = createFocusDashboard({ getState: () => state, update: fn => commit(fn, { history: false }), notify: toast });
const pageOf = (s=state) => s.pages.find(p=>p.id===s.activePageId) || s.pages[0];
const locate = (s,id) => { for(const p of s.pages) for(const b of p.boards) { const link=b.links.find(l=>l.id===id); if(link) return {p,b,link}; } return null; };
const getBoard = (s,id) => { for(const p of s.pages) { const b=p.boards.find(b=>b.id===id); if(b) return {p,b}; } return null; };
const count = s => s.pages.reduce((n,p)=>n+p.boards.reduce((n,b)=>n+b.links.length,0),0);
const safe = fn => async (...args) => { try { await fn(...args); } catch(e) { console.error(e); toast(e.message || 'Something went wrong. Please try again.',true); } };
function toast(message, error=false) { const e=document.createElement('div'); e.className=`toast${error?' error':''}`; e.textContent=message; $('#toasts').append(e); setTimeout(()=>e.remove(),5000); }
function saving(change) {pendingWrites+=change;document.body.setAttribute('aria-busy',String(pendingWrites>0));$('.storage-status').textContent=pendingWrites?'Saving on this device…':'Saved on this device';}
async function commit(fn,{history=true}={}) {
  saving(1);try {let before;
    state=await mutateState(s=>{ before=structuredClone(s); fn(s); s.updatedAt=Date.now(); });
    if(history) { undoStack.push({before,after:structuredClone(state)}); redoStack=[]; }
    render();
  }finally{saving(-1);}
}
async function history(direction) {
  const from=direction==='undo'?undoStack:redoStack, to=direction==='undo'?redoStack:undoStack;
  const entry=from.at(-1); if(!entry) return toast('Nothing to '+direction+'.');
  let applied=false;
  saving(1);try{state=await mutateState(s=>{ const expected=direction==='undo'?entry.after:entry.before; if(contentSignature(s)!==contentSignature(expected)) return; const snapshot=structuredClone(direction==='undo'?entry.before:entry.after); const collapsed=new Map(s.pages.flatMap(p=>p.boards.map(b=>[b.id,b.collapsed])));snapshot.pages.forEach(p=>p.boards.forEach(b=>{if(collapsed.has(b.id))b.collapsed=collapsed.get(b.id);}));s.pages=snapshot.pages;s.trash=snapshot.trash;s.activePageId=s.pages.some(p=>p.id===s.activePageId)?s.activePageId:snapshot.activePageId;s.updatedAt=Date.now();applied=true; });}finally{saving(-1);}
  if(!applied) {undoStack=[];redoStack=[];render();return toast('Workspace changed in another window. History was refreshed.');}
  from.pop(); to.push(entry); selected.clear(); render(); toast(direction==='undo'?'Change undone.':'Change restored.');
}
function applyAppearance() {
  const s=state.settings;
  const theme=s.theme==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):s.theme;
  for(const [key,value] of Object.entries({theme,wallpaper:s.wallpaper,density:s.density})) {document.body.dataset[key]=value;document.documentElement.dataset[key]=value;}
  const accent=/^#[\da-f]{6}$/i.test(s.accent)?s.accent:'#34d399';document.documentElement.style.setProperty('--accent',accent);document.body.style.setProperty('--accent',accent);document.documentElement.style.setProperty('--accent-rgb',[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16)).join(', '));document.body.style.setProperty('--accent-rgb',[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16)).join(', '));
  document.documentElement.style.setProperty('--columns',Math.max(1,Math.min(6,Number(s.columns)||4)));
  const image=String(s.customWallpaper||'');
  document.documentElement.style.setProperty('--custom-wallpaper',/^data:image\/(png|jpeg|webp|gif|avif);base64,[a-z\d+/=]+$/i.test(image)?`url("${image}")`:'none');
  document.body.classList.toggle('privacy-mode',!!s.privacy);
  document.body.classList.toggle('hide-descriptions',!s.showDescriptions);
  document.body.classList.toggle('hide-domains',s.showDomains===false);
  document.body.dataset.layout=s.layout||'boards';
  document.body.style.setProperty('--surface-opacity',`${s.surfaceOpacity??88}%`);
  $$('button[data-layout]').forEach(e=>{e.classList.toggle('active',e.dataset.layout===s.layout);e.setAttribute('aria-pressed',String(e.dataset.layout===s.layout));});
  for(const name of ['privacy','incognito']) { const e=$(`.tool-btn[data-action="${name}"]`); e.classList.toggle('active',!!s[name]);e.setAttribute('aria-pressed',String(!!s[name])); }
}
function matches(link) {
  const text=[link.title,link.url,link.description,...(link.tags||[])].join(' ').toLowerCase();
  const terms=search.trim().toLowerCase();
  if(!terms) return true;
  if($('#exactSearch').checked) return text.includes(terms);
  return terms.split(/\s+/).every(t=>t.startsWith('#')?(link.tags||[]).some(tag=>tag.toLowerCase().includes(t.slice(1))):text.includes(t));
}
function render() {
  if(!state) return;
  applyAppearance(); const page=pageOf();
  document.body.classList.toggle('searching',!!search.trim());
  focusDashboard.render();
  $('#pageTabs').innerHTML=state.pages.map(p=>`<button class="page-tab${p.id===page.id?' active':''}" data-page="${esc(p.id)}" draggable="true" aria-current="${p.id===page.id?'page':'false'}"><span>${esc(p.name)}</span><span class="page-tab-count">${p.boards.reduce((n,b)=>n+b.links.length,0)}</span></button>`).join('');
  $('#pageTitle').textContent=search?`Search your space`:page.name;
  const pages=search && $('#searchScope').value==='all'?state.pages:[page];
  let visible=0; const boards=[];
  for(const p of pages) for(const b of p.boards) {
    const links=b.links.filter(matches); if(search&&!links.length) continue; visible+=links.length;
    boards.push(`<article class="board${b.collapsed&&!search?' collapsed':''}" data-board="${esc(b.id)}" data-page-id="${esc(p.id)}" draggable="${!search&&!selectionMode}" style="--board-accent:${/^#[\da-f]{6}$/i.test(b.color)?b.color:state.settings.accent}">
      <header class="board-header"><button class="icon-button collapse-board" data-action="collapse" data-id="${esc(b.id)}" aria-label="${b.collapsed?'Expand':'Collapse'} ${esc(b.name)}" aria-expanded="${!b.collapsed}">${icon('chevron',14)}</button><h2 class="board-title">${esc(b.name)}</h2><span class="board-count">${links.length}</span><div class="board-actions"><button class="icon-button" data-action="board-menu" data-id="${esc(b.id)}" title="Board options" aria-label="Options for ${esc(b.name)}">${icon('more',17)}</button></div></header>
      ${search&&pages.length>1?`<div class="result-page">${esc(p.name)}</div>`:''}<div class="links" data-drop-board="${esc(b.id)}" ${b.collapsed&&!search?'hidden':''}>${links.map(l=>bookmarkHtml(l,b.id)).join('')}${!links.length?'<p class="board-empty">Room for something good.</p>':''}</div><footer class="board-footer" ${b.collapsed&&!search?'hidden':''}><button class="add-link" data-action="add-link" data-id="${esc(b.id)}">${icon('plus',14)} Add bookmark</button></footer></article>`);
  }
  $('#boards').innerHTML=boards.join('');
  $('#workspaceMeta').textContent=search?`${visible} result${visible===1?'':'s'} ${pages.length>1?'across your pages':'on this page'}`:`${page.boards.length} boards · ${page.boards.reduce((n,b)=>n+b.links.length,0)} bookmarks · made for your everyday`;
  $('#emptyState').hidden=boards.length>0;
  $('#emptyState').innerHTML=search?`${icon('search',40)}<h2>No bookmarks found</h2><p>Try a different word, URL, note, or #tag.</p><button class="button secondary" data-action="clear-search">Clear search</button>`:`${icon('board',44)}<h2>A fresh page, a fresh start.</h2><p>Create a board and give your favorite links a home.</p><button class="button primary" data-action="add-board">Create your first board</button>`;
  $('#searchOptions').hidden=!search;
  $('#selectionBar').hidden=!selectionMode;
  $('#selectionBar').innerHTML=`<strong>${selected.size} selected</strong><button class="button secondary" data-action="select-all">Select visible</button><button class="button secondary" data-action="move-selected">Move to board</button><button class="button secondary" data-action="open-selected">Open</button><button class="button danger" data-action="delete-selected">Move to trash</button><button class="text-button" data-action="select">Done</button>`;
  $('[data-action="undo"]').disabled=!undoStack.length; $('[data-action="redo"]').disabled=!redoStack.length;
  $$('img.favicon').forEach(img=>img.addEventListener('error',()=>{img.hidden=true; img.nextElementSibling.hidden=false;},{once:true}));
}
function bookmarkHtml(l, boardId) {
  let domain='';try{domain=new URL(l.url).hostname.replace(/^www\./,'');}catch{}
  const favicon=globalThis.chrome?.runtime?.id?chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(l.url)}&size=32`):'';
  return `<div class="bookmark${selected.has(l.id)?' selected':''}" data-link="${esc(l.id)}" data-source-board="${esc(boardId)}" draggable="${!selectionMode}">${selectionMode?`<input type="checkbox" class="link-select" data-select="${esc(l.id)}" aria-label="Select ${esc(l.title)}" ${selected.has(l.id)?'checked':''}>`:''}<a class="bookmark-anchor" href="${esc(l.url)}" data-open="${esc(l.id)}" target="_blank" rel="noopener noreferrer">${favicon?`<img class="favicon" src="${esc(favicon)}" alt="" loading="lazy">`:''}<span class="favicon-fallback" ${favicon?'hidden':''} aria-hidden="true">${esc((l.title||domain||'?')[0].toUpperCase())}</span><span class="bookmark-copy"><span class="bookmark-title">${esc(l.title||domain||l.url)}</span>${l.description?`<span class="bookmark-description">${esc(l.description)}</span>`:''}<span class="bookmark-domain">${esc(domain)}</span>${l.tags?.length?`<span class="bookmark-tags">${l.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</span>`:''}</span></a><div class="bookmark-actions"><button class="icon-button" data-action="link-menu" data-id="${esc(l.id)}" title="Bookmark options" aria-label="Options for ${esc(l.title)}">${icon('more',16)}</button></div></div>`;
}
function dialog(title,html,{wide=false}={}) {hideMenu();const e=$('#modal'); e.classList.toggle('wide',wide);$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html; if(!e.open)e.showModal(); $('input:not([type="checkbox"]):not([type="hidden"]),textarea,select,button', $('#dialogBody'))?.focus();}
function closeDialog() {$('#modal').close();$('#dialogBody').innerHTML='';}
const field=(label,name,value='',type='text',extra='')=>`<label class="field"><span>${esc(label)}</span><input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
const buttons=(submit='Save')=>`<div class="dialog-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary" type="submit">${submit}</button></div><p class="form-error" role="alert"></p>`;
function bindForm(fn) {$('#dialogBody form').addEventListener('submit',safe(async e=>{e.preventDefault();const form=e.currentTarget;const btn=$('[type="submit"]',form);btn.disabled=true;try{await fn(new FormData(form),form);}catch(error){$('.form-error',form).textContent=error.message;}finally{if(btn.isConnected)btn.disabled=false;}}));}
function editPage(id) {
  const p=state.pages.find(p=>p.id===id); dialog(p?'Edit page':'Create a page',`<form class="form-stack">${field('Page name','name',p?.name||'','text','required autofocus placeholder="e.g. Work, Inspiration, Weekend"')}${buttons(p?'Save changes':'Create page')}</form>`);
  bindForm(async data=>{const name=data.get('name').trim();if(!name)throw Error('Give your page a name.');await commit(s=>{if(p){s.pages.find(x=>x.id===id).name=name;}else{const id=uid();s.pages.push({id,name,boards:[]});s.activePageId=id;}});closeDialog();});
}
function editBoard(id) {
  const found=getBoard(state,id); const b=found?.b;
  dialog(b?'Edit board':'Create a board',`<form class="form-stack">${field('Board name','name',b?.name||'','text','required placeholder="e.g. Daily essentials"')}<div class="form-row">${field('Board accent','color',b?.color||state.settings.accent,'color')}<label class="field"><span>Page</span><select name="pageId">${state.pages.map(p=>`<option value="${esc(p.id)}" ${p.id===(found?.p.id||pageOf().id)?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label></div>${buttons(b?'Save changes':'Create board')}</form>`);
  bindForm(async data=>{const name=data.get('name').trim();if(!name)throw Error('Give your board a name.');await commit(s=>{const dest=s.pages.find(p=>p.id===data.get('pageId'));if(!dest)throw Error('Destination page no longer exists.');if(b){const found=getBoard(s,id);if(!found)throw Error('This board was changed in another window.');Object.assign(found.b,{name,color:data.get('color')});if(found.p.id!==dest.id){found.p.boards=found.p.boards.filter(x=>x.id!==id);dest.boards.push(found.b);}}else dest.boards.push({id:uid(),name,color:data.get('color'),links:[]});s.activePageId=dest.id;});closeDialog();});
}
function editLink(id,boardId) {
  const found=locate(state,id);const l=found?.link;
  if(!state.pages.some(p=>p.boards.length))return editBoard();
  dialog(l?'Edit bookmark':'Save a little inspiration',`<form class="form-stack">${field('URL','url',l?.url||'','text','required placeholder="https://example.com"')}${field('Title','title',l?.title||'','text','placeholder="A name you’ll remember"')}<label class="field"><span>Board</span><select name="boardId">${boardOptions(found?.b.id||boardId||pageOf().boards[0]?.id)}</select></label><label class="field"><span>Note <span class="muted">optional</span></span><textarea name="description" rows="3" placeholder="Why did you save this?">${esc(l?.description||'')}</textarea></label>${field('Tags','tags',(l?.tags||[]).join(', '),'text','placeholder="design, useful, read later"')}${buttons(l?'Save changes':'Save bookmark')}</form>`);
  bindForm(async data=>{const url=normalizeUrl(data.get('url'));const title=data.get('title').trim()||new URL(url).hostname||url;await commit(s=>{const dest=getBoard(s,data.get('boardId'));if(!dest)throw Error('Destination board no longer exists.');const old=l?locate(s,id):null;if(l&&!old)throw Error('This bookmark was changed in another window.');const link={...(old?.link||{}),id:l?.id||uid(),title,url,description:data.get('description').trim(),tags:[...new Set(data.get('tags').split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean))],createdAt:old?.link.createdAt||Date.now()};if(old){const pos=old.b.links.findIndex(x=>x.id===id);old.b.links.splice(pos,1);if(old.b.id===dest.b.id){dest.b.links.splice(pos,0,link);}else dest.b.links.push(link);}else dest.b.links.push(link);});closeDialog();toast(l?'Bookmark updated.':'Bookmark saved.');});
}
const boardOptions=selectedId=>state.pages.map(p=>`<optgroup label="${esc(p.name)}">${p.boards.map(b=>`<option value="${esc(b.id)}" ${b.id===selectedId?'selected':''}>${esc(b.name)}</option>`).join('')}</optgroup>`).join('');
function stash(s,kind,id) {
  if(kind==='link'){const f=locate(s,id);if(!f)return;s.trash.push({id:uid(),kind,item:f.link,pageId:f.p.id,boardId:f.b.id,index:f.b.links.indexOf(f.link),deletedAt:Date.now()});f.b.links=f.b.links.filter(l=>l.id!==id);}
  if(kind==='board'){const f=getBoard(s,id);if(!f)return;s.trash.push({id:uid(),kind,item:f.b,pageId:f.p.id,index:f.p.boards.indexOf(f.b),deletedAt:Date.now()});f.p.boards=f.p.boards.filter(b=>b.id!==id);}
  if(kind==='page'){const p=s.pages.find(p=>p.id===id);if(!p)return;s.trash.push({id:uid(),kind,item:p,index:s.pages.indexOf(p),deletedAt:Date.now()});s.pages=s.pages.filter(p=>p.id!==id);if(!s.pages.length){const p={id:uid(),name:'Home',boards:[]};s.pages.push(p);}if(s.activePageId===id)s.activePageId=s.pages[0].id;}
}
async function remove(kind,id) {await commit(s=>stash(s,kind,id));toast(`${kind[0].toUpperCase()+kind.slice(1)} moved to trash. Undo with Ctrl+Z.`);}
function confirmAction(title,message,fn,label='Confirm') {dialog(title,`<form class="form-stack"><p>${esc(message)}</p>${buttons(label)}</form>`);bindForm(async()=>{await fn();closeDialog();});}
async function openUrls(urls,{incognito=state.settings.incognito,newTab=state.settings.openInNewTab}={}) {
  urls=urls.map(u=>normalizeUrl(u));if(!urls.length)return;
  if(incognito) {if(!globalThis.chrome?.windows)throw Error('Incognito opening is available when Lumen is installed in Chrome.');await chrome.windows.create({incognito:true,url:urls});return;}
  if(globalThis.chrome?.tabs){for(const url of urls)await chrome.tabs.create({url,active:urls.length===1});if(!newTab&&urls.length===1){const tab=await chrome.tabs.getCurrent();if(tab?.id)await chrome.tabs.remove(tab.id);}return;}
  if(urls.length>1) return toast('Opening multiple links is available in the installed extension.');
  if(newTab)window.open(urls[0],'_blank','noopener,noreferrer');else location.href=urls[0];
}
function prepareDownload(anchor,name,text,type='text/plain') {const url=URL.createObjectURL(new Blob([text],{type}));anchor.href=url;anchor.download=name;setTimeout(()=>URL.revokeObjectURL(url),10000);}
function download(name,text,type='text/plain') {const a=document.createElement('a');prepareDownload(a,name,text,type);($('#modal').open?$('#modal'):document.body).append(a);a.click();a.remove();}
function exportState(format='json',subset=state,anchor=null) {const date=new Date().toISOString().slice(0,10);const name=`lumen-${date}.${format}`,text=format==='html'?exportHtml(subset):format==='csv'?exportCsv(subset):exportJson(subset),type=format==='html'?'text/html':format==='csv'?'text/csv':'application/json';if(anchor)prepareDownload(anchor,name,text,type);else download(name,text,type);toast('Export downloaded.');}
function showMenu(anchor,items) {const e=$('#menu');e.innerHTML=items.map((x,i)=>x?`<button role="menuitem" data-menu-index="${i}" ${x.danger?'class="danger"':''}>${icon(x.icon||'more',16)} ${esc(x.label)}</button>`:'<hr>').join('');e.hidden=false;const r=anchor.getBoundingClientRect();e.style.left=Math.max(8,Math.min(r.right-220,innerWidth-240))+'px';e.style.top=Math.max(8,Math.min(r.bottom+7,innerHeight-e.offsetHeight-12))+'px';e.onclick=safe(async event=>{const b=event.target.closest('[data-menu-index]');if(b){hideMenu();await items[Number(b.dataset.menuIndex)].fn();}});$('button',e)?.focus();}
function hideMenu() {$('#menu').hidden=true;}
function reorder(kind,id,delta) {return commit(s=>{const list=kind==='page'?s.pages:getBoard(s,id)?.p.boards;if(!list)return;const index=list.findIndex(x=>x.id===id),target=index+delta;if(index<0||target<0||target>=list.length)return;const [item]=list.splice(index,1);list.splice(target,0,item);});}
function boardMenu(anchor,id) {const b=getBoard(state,id)?.b;if(!b)return;showMenu(anchor,[{label:'Edit / move board',icon:'edit',fn:()=>editBoard(id)},{label:'Move earlier',icon:'undo',fn:()=>reorder('board',id,-1)},{label:'Move later',icon:'redo',fn:()=>reorder('board',id,1)},{label:'Open all bookmarks',icon:'open',fn:()=>openUrls(b.links.map(l=>l.url))},{label:'Add bookmark',icon:'plus',fn:()=>editLink(null,id)},{label:'Sort A → Z',fn:()=>commit(s=>getBoard(s,id).b.links.sort((a,b)=>a.title.localeCompare(b.title)))},{label:'Duplicate board',icon:'duplicates',fn:()=>commit(s=>{const f=getBoard(s,id);f.p.boards.push({...structuredClone(f.b),id:uid(),name:f.b.name+' copy',links:f.b.links.map(l=>({...l,id:uid()}))});})},{label:'Export board as HTML',icon:'export',fn:()=>exportState('html',{...state,pages:[{...pageOf(),boards:[b]}]})},null,{label:'Move board to trash',icon:'trash',danger:true,fn:()=>remove('board',id)}]);}
function linkMenu(anchor,id) {const f=locate(state,id);if(!f)return;showMenu(anchor,[{label:'Edit bookmark',icon:'edit',fn:()=>editLink(id)},{label:'Open in incognito',icon:'incognito',fn:()=>openUrls([f.link.url],{incognito:true})},{label:'Copy URL',icon:'link',fn:async()=>{await navigator.clipboard.writeText(f.link.url);toast('URL copied.');}},{label:'Move to another board',icon:'board',fn:()=>moveSelected([id])},null,{label:'Move to trash',icon:'trash',danger:true,fn:()=>remove('link',id)}]);}
function pageMenu(anchor) {const p=pageOf();showMenu(anchor,[{label:'Rename page',icon:'edit',fn:()=>editPage(p.id)},{label:'Move page left',icon:'undo',fn:()=>reorder('page',p.id,-1)},{label:'Move page right',icon:'redo',fn:()=>reorder('page',p.id,1)},{label:'Duplicate page',icon:'duplicates',fn:()=>commit(s=>{const clone=structuredClone(s.pages.find(x=>x.id===p.id));clone.id=uid();clone.name+=' copy';clone.boards.forEach(b=>{b.id=uid();b.links.forEach(l=>l.id=uid());});s.pages.push(clone);s.activePageId=clone.id;})},{label:'Export page as HTML',icon:'export',fn:()=>exportState('html',{...state,pages:[p]})},{label:'Export page as JSON',icon:'export',fn:()=>exportState('json',{version:1,pages:[p],activePageId:p.id,trash:[]})},null,{label:'Move page to trash',icon:'trash',danger:true,fn:()=>confirmAction('Move page to trash?',`“${p.name}” and its boards will stay in trash until you restore or permanently delete them.`,()=>remove('page',p.id),'Move to trash')}]);}
function moveSelected(ids=[...selected]) {if(!ids.length)return toast('Select at least one bookmark.');dialog('Move bookmarks',`<form class="form-stack"><label class="field"><span>Destination board</span><select name="boardId">${boardOptions()}</select></label>${buttons('Move bookmarks')}</form>`);bindForm(async data=>{await commit(s=>{const target=getBoard(s,data.get('boardId'));if(!target)throw Error('Choose a destination board.');for(const id of ids){const f=locate(s,id);if(f&&f.b.id!==target.b.id){f.b.links=f.b.links.filter(l=>l.id!==id);target.b.links.push(f.link);}}});selected.clear();selectionMode=false;closeDialog();render();toast('Bookmarks moved.');});}

function showImport() {
  dialog('Bring your bookmarks home',`<div class="form-stack"><p class="muted">Import browser bookmarks, LumiList JSON exports, or links from a file. Your existing bookmarks stay safe.</p><button class="button secondary" id="importBrowser">${icon('import')} Import from Chrome bookmarks</button><div class="dropzone"><label for="importFile">Choose a bookmark file <span class="muted">JSON, HTML, CSV, or TXT</span></label><input id="importFile" type="file" accept=".json,.html,.htm,.csv,.txt"></div><form><label class="field"><span>Or paste links / backup JSON</span><textarea name="text" rows="5" placeholder="https://example.com&#10;A useful link &lt;https://example.org&gt;"></textarea></label><label class="field"><span>Loose links go to</span><select name="boardId"><option value="">New “Imported links” board</option>${boardOptions()}</select></label><label class="setting-row"><span>Skip URLs already in your workspace</span><input type="checkbox" name="dedupe" checked></label><label class="setting-row"><span>Replace workspace from a JSON backup <small>Your current workspace will download as a backup first.</small></span><input type="checkbox" name="replace"></label><p id="importPreview" class="muted"></p>${buttons('Import bookmarks')}</form></div>`,{wide:true});
  let fileText='', fileName='';const form=$('#dialogBody form');
  const preview=text=>{try{const data=parseImport(text,fileName);const links=data.links.length+data.pages.reduce((n,p)=>n+p.boards.reduce((n,b)=>n+b.links.length,0),0);$('#importPreview').textContent=`Ready to import ${links} bookmarks${data.pages.length?` in ${data.pages.length} pages`:''}.`;}catch(e){$('#importPreview').textContent=e.message;}};
  $('#importFile').addEventListener('change',safe(async e=>{const file=e.target.files[0];if(!file)return;fileText=await file.text();fileName=file.name;form.elements.text.value='';preview(fileText);}));
  form.elements.text.addEventListener('input',e=>{fileText='';fileName='';preview(e.target.value);});
  $('#importBrowser').addEventListener('click',safe(async()=>{
    if(!globalThis.chrome?.bookmarks) {if(!globalThis.chrome?.permissions)throw Error('Chrome import is available when Lumen is installed as an extension.');}
    const granted=await chrome.permissions.request({permissions:['bookmarks']});if(!granted)return toast('Bookmark access was not granted. You can still import an HTML export.',true);
    const nodes=await chrome.bookmarks.getTree();
    const flatten=(nodes,path=[])=>nodes.flatMap(n=>n.url?[{title:n.title,url:n.url,path}]:flatten(n.children||[],n.title?[...path,n.title]:path));
    const groups=new Map();for(const l of flatten(nodes)){try{l.url=normalizeUrl(l.url);}catch{continue;}const name=l.path.join(' / ')||'Bookmarks';if(!groups.has(name))groups.set(name,[]);groups.get(name).push({id:uid(),title:l.title||l.url,url:l.url,description:'',tags:[],createdAt:Date.now()});}
    const parsed={pages:[{id:uid(),name:'Chrome bookmarks',boards:[...groups].map(([name,links])=>({id:uid(),name,color:state.settings.accent,links}))}],links:[]};let result;
    await commit(s=>{result=mergeImport(s,parsed,{dedupe:form.elements.dedupe.checked});});closeDialog();toast(`Imported ${result.added} bookmarks. ${result.skipped} duplicates skipped.`);
  }));
  bindForm(async data=>{const text=fileText||data.get('text');const parsed=parseImport(text,fileName);let result;
    if(data.get('replace')){
      if(!/^[{[]/.test(text.trim())||!parsed.pages.length||!parsed.settings)throw Error('Choose a complete JSON workspace backup to replace your workspace.');
      exportState('json');
      await commit(s=>{s.pages=structuredClone(parsed.pages);s.activePageId=parsed.activePageId||s.pages[0].id;s.settings={...s.settings,...parsed.settings};s.trash=parsed.trash||[];s.focus=normalizeFocus(parsed.focus);});result={added:count(state),skipped:0};
    }else await commit(s=>{result=mergeImport(s,parsed,{pageId:pageOf(s).id,boardId:data.get('boardId')||undefined,dedupe:!!data.get('dedupe')});});
    closeDialog();selected.clear();render();toast(`Imported ${result.added} bookmarks. ${result.skipped} duplicates skipped.`);
  });
}
function showTrash() {
  dialog('A second chance',`<p class="muted">Deleted items stay here until you choose to remove them. Nothing expires automatically.</p><div class="trash-list">${state.trash.length?state.trash.slice().reverse().map(t=>`<div class="trash-item"><div><strong>${esc(t.item.title||t.item.name||'Untitled')}</strong><p class="muted">${esc(t.kind)} · ${new Date(t.deletedAt).toLocaleDateString()}</p></div><button class="button secondary" data-restore="${esc(t.id)}">Restore</button><button class="icon-button danger" data-purge="${esc(t.id)}" aria-label="Permanently delete ${esc(t.item.title||t.item.name)}">${icon('trash')}</button></div>`).join(''):'<div class="empty-state"><h3>Nothing to recover.</h3><p>Your trash is empty.</p></div>'}</div>${state.trash.length?'<div class="dialog-actions"><button class="button danger" id="emptyTrash">Empty trash</button></div>':''}`,{wide:true});
  $$('[data-restore]').forEach(e=>e.addEventListener('click',safe(async()=>{await commit(s=>restoreItem(s,e.dataset.restore));showTrash();toast('Restored to your workspace.');})));
  $$('[data-purge]').forEach(e=>e.addEventListener('click',()=>confirmAction('Permanently delete?', 'This removes the item from trash. You can undo this during this session.',async()=>{await commit(s=>{s.trash=s.trash.filter(t=>t.id!==e.dataset.purge);});},'Delete permanently')));
  $('#emptyTrash')?.addEventListener('click',()=>confirmAction('Empty trash?',`Permanently delete ${state.trash.length} items? You can undo this during this session.`,()=>commit(s=>{s.trash=[];}),'Empty trash'));
}
function restoreItem(s,id) {
  const t=s.trash.find(t=>t.id===id);if(!t)return;
  const insert=(items,item)=>items.splice(Math.min(t.index??items.length,items.length),0,item);
  if(t.kind==='page')insert(s.pages,t.item);
  else {
    let p=s.pages.find(p=>p.id===t.pageId);
    if(!p){p={id:t.pageId||uid(),name:'Recovered',boards:[]};s.pages.push(p);}
    if(t.kind==='board')insert(p.boards,t.item);
    else {let b=p.boards.find(b=>b.id===t.boardId);if(!b){b={id:t.boardId||uid(),name:'Recovered bookmarks',color:s.settings.accent,links:[]};p.boards.push(b);}insert(b.links,t.item);}
  }
  s.trash=s.trash.filter(x=>x.id!==id);
}
function duplicateGroups() {
  const groups=new Map();for(const p of state.pages)for(const b of p.boards)for(const l of b.links){let key=l.url;try{const u=new URL(key);u.hash='';key=u.href.replace(/\/$/,'');}catch{}if(!groups.has(key))groups.set(key,[]);groups.get(key).push({p,b,l});}return [...groups.values()].filter(g=>g.length>1);
}
function showDuplicates() {
  const groups=duplicateGroups();const extra=groups.reduce((n,g)=>n+g.length-1,0);
  dialog('Keep the good. Lose the duplicates.',`<p class="muted">${extra} extra copies across ${groups.length} URLs. Matching ignores URL fragments and a final slash. Review locations before removing copies.</p><div class="trash-list">${groups.map(g=>`<div class="duplicate-group"><strong>${esc(g[0].l.title)}</strong><p class="muted">${esc(g[0].l.url)}</p>${g.map(({p,b,l},i)=>`<div class="trash-item"><span>${esc(p.name)} / ${esc(b.name)} ${i===0?'<small class="tag">First copy</small>':''}</span><button class="icon-button danger" data-duplicate-remove="${esc(l.id)}" aria-label="Remove this copy">${icon('trash',16)}</button></div>`).join('')}</div>`).join('')||'<div class="empty-state"><h3>A tidy collection.</h3><p>No duplicate URLs found.</p></div>'}</div>${extra?'<div class="dialog-actions"><button class="button secondary" data-action="close-modal">Keep all</button><button class="button primary" id="deduplicate">Keep first copy of each</button></div>':''}`,{wide:true});
  $$('[data-duplicate-remove]').forEach(e=>e.addEventListener('click',safe(async()=>{await remove('link',e.dataset.duplicateRemove);showDuplicates();})));
  $('#deduplicate')?.addEventListener('click',()=>confirmAction('Remove duplicate copies?',`Move ${extra} extra bookmarks to trash? The first bookmark of each URL will remain.`,async()=>{await commit(s=>{for(const g of groups)for(const {l} of g.slice(1))stash(s,'link',l.id);});toast('Duplicate copies moved to trash.');},'Move copies to trash'));
}
function showSettings() {
  const s=state.settings;
  dialog('Make yourself at home',
    '<form class="form-stack" id="settingsForm">' +
    '<section class="settings-section"><p class="settings-eyebrow">01 / APPEARANCE</p><h3>A space that feels like you</h3><div class="theme-options">' +
    ['dark','light','system'].map(t=>'<button type="button" class="theme-option '+(s.theme===t?'selected':'')+'" data-setting-theme="'+t+'">'+({dark:'☾ Dark',light:'☀ Light',system:'◐ System'}[t])+'</button>').join('') +
    '</div><div class="form-row">'+field('Accent color','accent',s.accent,'color')+
    '<label class="field"><span>Columns</span><select name="columns">'+[1,2,3,4,5,6].map(n=>'<option '+(Number(s.columns)===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
    '<label class="field"><span>Spacing</span><select name="density"><option value="comfortable" '+(s.density==='comfortable'?'selected':'')+'>Comfortable</option><option value="compact" '+(s.density==='compact'?'selected':'')+'>Compact</option></select></label></div>'+
    '<div class="form-row appearance-row"><label class="field"><span>Collection layout</span><select name="layout"><option value="boards" '+(s.layout!=='list'?'selected':'')+'>Boards</option><option value="list" '+(s.layout==='list'?'selected':'')+'>List</option></select></label><label class="field"><span>Card opacity <output id="opacityValue">'+(s.surfaceOpacity??88)+'%</output></span><input type="range" name="surfaceOpacity" min="35" max="100" value="'+(s.surfaceOpacity??88)+'"></label></div>'+
    '<h3 class="wallpaper-heading">Set the atmosphere</h3><div class="wallpaper-options">'+['aurora','midnight','forest','ocean','sunset','rose','paper'].map(w=>'<button type="button" class="wallpaper-option '+(s.wallpaper===w?'selected':'')+'" data-wallpaper-option="'+w+'" data-wallpaper="'+w+'"><span>'+w[0].toUpperCase()+w.slice(1)+'</span></button>').join('')+'</div>'+
    '<label class="field wallpaper-upload"><span>Or bring your own wallpaper</span><input id="wallpaperFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"><small class="muted">Stored on this device and included in your backup.</small></label></section>'+
    '<section class="settings-section"><p class="settings-eyebrow">02 / YOUR ROUTINE</p><h3>A little more intention</h3>'+
    [['showFocusPanel','Show the daily focus panel'],['showDescriptions','Show bookmark notes'],['showDomains','Show website addresses'],['openInNewTab','Open bookmarks in a new tab'],['privacy','Blur bookmark content for screen sharing'],['incognito','Open bookmarks in incognito windows']].map(([key,label])=>'<label class="setting-row"><span>'+label+'</span><input class="toggle" type="checkbox" name="'+key+'" '+(s[key]?'checked':'')+'></label>').join('')+'</section>'+
    '<section class="settings-section"><p class="settings-eyebrow">03 / YOUR DATA</p><h3>A copy to keep</h3><p class="muted">Your bookmarks, preferences, and daily focus stay in this browser profile. Keep a backup for your next device.</p><div class="export-options"><a class="button secondary" data-action="export-json" data-export="json" href="#">'+icon('export',16)+' Full backup · JSON</a><a class="button secondary" data-action="export-html" data-export="html" href="#">Browser HTML</a><a class="button secondary" data-action="export-csv" data-export="csv" href="#">CSV</a></div><p id="storageEstimate" class="muted"></p></section>'+buttons('Save preferences')+'</form>',{wide:true});
  let theme=s.theme,wallpaper=s.wallpaper,customWallpaper=s.customWallpaper;
  $$('[data-setting-theme]').forEach(e=>e.addEventListener('click',()=>{theme=e.dataset.settingTheme;$$('[data-setting-theme]').forEach(b=>b.classList.toggle('selected',b===e));}));
  $$('[data-wallpaper-option]').forEach(e=>e.addEventListener('click',()=>{wallpaper=e.dataset.wallpaperOption;$$('[data-wallpaper-option]').forEach(b=>b.classList.toggle('selected',b===e));}));
  $('[name="surfaceOpacity"]').addEventListener('input',e=>{$('#opacityValue').textContent=e.target.value+'%';});
  $('#wallpaperFile').addEventListener('change',safe(async e=>{const file=e.target.files[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type))throw Error('Choose a PNG, JPEG, WebP, GIF, or AVIF image.');customWallpaper=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read this image.'));r.readAsDataURL(file);});wallpaper='custom';$$('[data-wallpaper-option]').forEach(b=>b.classList.remove('selected'));toast('Wallpaper ready. Save preferences to apply.');}));
  if(navigator.storage?.estimate)navigator.storage.estimate().then(({usage})=>{const e=$('#storageEstimate');if(e)e.textContent='Local storage: '+((usage||0)/1024/1024).toFixed(2)+' MB · '+count(state)+' bookmarks · no plan limits';}).catch(()=>{});
  bindForm(async data=>{await commit(s=>{Object.assign(s.settings,{theme,wallpaper,customWallpaper,accent:data.get('accent'),columns:Number(data.get('columns')),density:data.get('density'),layout:data.get('layout'),surfaceOpacity:Number(data.get('surfaceOpacity'))});for(const k of ['showDescriptions','showDomains','showFocusPanel','openInNewTab','privacy','incognito'])s.settings[k]=!!data.get(k);},{history:false});closeDialog();toast('Your workspace, your way.');});
}
function showHelp() {dialog('A little help',`<div class="form-stack"><p>Lumen keeps your bookmarks on this device. Every feature is free. Import a collection or create a board to get started.</p><div class="shortcut-list"><p><kbd>/</kbd> Find a bookmark, URL, note, or #tag</p><p><kbd>Esc</kbd> Close a dialog, menu, or search</p><p><kbd>Ctrl / ⌘ + Z</kbd> Undo this session’s change</p><p><kbd>Ctrl / ⌘ + Shift + Z</kbd> Redo</p><p><kbd>Alt + P</kbd> Toggle privacy blur</p><p><kbd>Ctrl / ⌘ + Shift + Y</kbd> Save the current browser tab</p></div><p class="muted">Drag pages to reorder them. Drag a board onto another page tab to move it. Drag a bookmark onto another board or page tab. Use each item’s options menu for editing and moving with the keyboard.</p><p class="muted">Privacy blur hides content visually; it is not encryption. Incognito uses Chrome’s private windows. Back up from Settings before removing the extension or changing browser profiles.</p><div class="dialog-actions"><button class="button primary" data-action="close-modal">Got it</button></div></div>`);}

const actions={
  'add-page':()=>editPage(), 'add-board':()=>editBoard(), 'add-link':(e,id)=>editLink(null,id), 'page-menu':e=>pageMenu(e), 'board-menu':(e,id)=>boardMenu(e,id), 'link-menu':(e,id)=>linkMenu(e,id),
  'close-modal':closeDialog, import:showImport,settings:showSettings,trash:showTrash,duplicates:showDuplicates,help:showHelp,
  undo:()=>history('undo'),redo:()=>history('redo'),privacy:()=>commit(s=>{s.settings.privacy=!s.settings.privacy;},{history:false}),incognito:async()=>{await commit(s=>{s.settings.incognito=!s.settings.incognito;},{history:false});if(state.settings.incognito)toast('Links now open in Chrome incognito windows.');},
  collapse:(_,id)=>commit(s=>{const f=getBoard(s,id);if(f)f.b.collapsed=!f.b.collapsed;},{history:false}),
  'export-json':()=>exportState('json'),'export-html':()=>exportState('html'),'export-csv':()=>exportState('csv'),
  'clear-search':()=>{search='';$('#search').value='';render();},
  select:()=>{selectionMode=!selectionMode;selected.clear();render();},
  'select-all':()=>{$$('[data-link]').forEach(e=>selected.add(e.dataset.link));render();},
  'move-selected':()=>moveSelected(),
  'open-selected':()=>openUrls([...selected].map(id=>locate(state,id)?.link.url).filter(Boolean)),
  'delete-selected':async()=>{if(!selected.size)return toast('Select at least one bookmark.');await commit(s=>{for(const id of selected)stash(s,'link',id);});selected.clear();render();toast('Selected bookmarks moved to trash.');}
};
document.addEventListener('click',safe(async event=>{
  const layout=event.target.closest('button[data-layout]');if(layout){await commit(s=>{s.settings.layout=layout.dataset.layout;},{history:false});return;}
  const page=event.target.closest('[data-page]');if(page){search='';$('#search').value='';selected.clear();await commit(s=>{s.activePageId=page.dataset.page;},{history:false});return;}
  const open=event.target.closest('[data-open]');if(open){event.preventDefault();const f=locate(state,open.dataset.open);if(f)await openUrls([f.link.url],{newTab:event.ctrlKey||event.metaKey||event.shiftKey||state.settings.openInNewTab});return;}
  const btn=event.target.closest('[data-action]');if(btn){if(btn.matches('a[data-export]')){exportState(btn.dataset.export,state,btn);return;}const action=actions[btn.dataset.action];if(action)await action(btn,btn.dataset.id);return;}
  if(!event.target.closest('#menu'))hideMenu();
}));
document.addEventListener('change',e=>{if(e.target.matches('[data-select]')){const id=e.target.dataset.select;if(e.target.checked)selected.add(id);else selected.delete(id);render();}});
$('#search').addEventListener('input',e=>{search=e.target.value;render();});
$('#searchScope').addEventListener('change',render);$('#exactSearch').addEventListener('change',render);
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
document.addEventListener('keydown',safe(async e=>{
  const input=e.target.closest('input,textarea,select,[contenteditable="true"]');
  if(e.key==='Escape'){hideMenu();if(!$('#modal').open&&search){search='';$('#search').value='';render();}return;}
  if(e.key==='/'&&!input&&!$('#modal').open){e.preventDefault();$('#search').focus();}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!input&&!$('#modal').open){e.preventDefault();await history(e.shiftKey?'redo':'undo');}
  if(e.altKey&&e.key.toLowerCase()==='p'&&!input){e.preventDefault();await actions.privacy();}
  if(e.key==='ArrowDown'&&!$('#menu').hidden){e.preventDefault();const items=$$('button',$('#menu'));items[(items.indexOf(document.activeElement)+1)%items.length]?.focus();}
  if(e.key==='ArrowUp'&&!$('#menu').hidden){e.preventDefault();const items=$$('button',$('#menu'));items[(items.indexOf(document.activeElement)-1+items.length)%items.length]?.focus();}
}));
document.addEventListener('dragstart',e=>{
  const link=e.target.closest('[data-link]'),board=e.target.closest('[data-board]'),page=e.target.closest('[data-page]');
  if(e.target.closest('input,button:not(.page-tab)')){e.preventDefault();return;}
  dragged=link?{kind:'link',id:link.dataset.link}:board?{kind:'board',id:board.dataset.board}:page?{kind:'page',id:page.dataset.page}:null;
  if(dragged){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-lumen',JSON.stringify(dragged));e.target.classList.add('dragging');}
});
document.addEventListener('dragover',e=>{if(dragged&&e.target.closest('[data-board],[data-page],#boards')){e.preventDefault();e.dataTransfer.dropEffect='move';$$('.drag-over').forEach(x=>x.classList.remove('drag-over'));e.target.closest('[data-link],[data-board],[data-page]')?.classList.add('drag-over');}});
document.addEventListener('dragend',()=>{dragged=null;$$('.dragging,.drag-over').forEach(x=>x.classList.remove('dragging','drag-over'));});
document.addEventListener('drop',safe(async e=>{
  if(!dragged)return;e.preventDefault();const item=dragged;dragged=null;$$('.dragging,.drag-over').forEach(x=>x.classList.remove('dragging','drag-over'));
  const tab=e.target.closest('[data-page]'),targetBoard=e.target.closest('[data-board]'),targetLink=e.target.closest('[data-link]');
  const after=el=>{const r=el.getBoundingClientRect();return e.clientY>r.top+r.height/2;};
  await commit(s=>{
    if(item.kind==='page'&&tab){const idx=s.pages.findIndex(p=>p.id===item.id);if(idx<0)return;const [page]=s.pages.splice(idx,1);const dest=s.pages.findIndex(p=>p.id===tab.dataset.page);if(dest<0){s.pages.splice(idx,0,page);return;}s.pages.splice(dest+(e.clientX>tab.getBoundingClientRect().left+tab.offsetWidth/2?1:0),0,page);}
    if(item.kind==='board'){const src=getBoard(s,item.id);if(!src)return;const page=tab?s.pages.find(p=>p.id===tab.dataset.page):targetBoard?getBoard(s,targetBoard.dataset.board)?.p:pageOf(s);if(!page)return;if(targetBoard?.dataset.board===item.id)return;src.p.boards=src.p.boards.filter(b=>b.id!==item.id);const idx=targetBoard?page.boards.findIndex(b=>b.id===targetBoard.dataset.board):-1;page.boards.splice(idx<0?page.boards.length:idx+(after(targetBoard)?1:0),0,src.b);}
    if(item.kind==='link'){const src=locate(s,item.id);if(!src)return;let dest=targetBoard?getBoard(s,targetBoard.dataset.board):null;if(tab){const page=s.pages.find(p=>p.id===tab.dataset.page);if(page){if(!page.boards.length)page.boards.push({id:uid(),name:'Inbox',color:s.settings.accent,links:[]});dest={p:page,b:page.boards[0]};}}if(!dest||targetLink?.dataset.link===item.id)return;src.b.links=src.b.links.filter(l=>l.id!==item.id);const idx=targetLink?dest.b.links.findIndex(l=>l.id===targetLink.dataset.link):-1;dest.b.links.splice(idx<0?dest.b.links.length:idx+(after(targetLink)?1:0),0,src.link);}
  });
}));
async function refreshExternal() {if(externalRefresh)return;externalRefresh=true;try{const latest=await loadState();if(canonical(latest)!==canonical(state)){if(contentSignature(latest)!==contentSignature(state)){undoStack=[];redoStack=[];selected.clear();}state=latest;render();}}finally{externalRefresh=false;}}
if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('lumen-workspace');channel.onmessage=()=>{safe(refreshExternal)();};}
window.addEventListener('focus',()=>{if(state)safe(refreshExternal)();});
window.addEventListener('storage',()=>{if(state)safe(refreshExternal)();});
window.addEventListener('resize',hideMenu);
matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(state?.settings.theme==='system')applyAppearance();});
for(const e of $$('.tool-btn'))e.innerHTML=icon(e.dataset.action,20);
for(const name of ['undo','redo'])$(`[data-action="${name}"]`).innerHTML=icon(name,17);
$('[data-action="page-menu"]').innerHTML=icon('more');$('#searchIcon').innerHTML=icon('search',18);
try {state=await loadState();render();}catch(e){$('#workspaceMeta').textContent='Your workspace could not be loaded.';$('#emptyState').hidden=false;$('#emptyState').innerHTML=`<h2>Local storage needs attention</h2><p>${esc(e.message)}</p><p>Try reopening this tab. Your stored workspace has not been intentionally cleared.</p>`;toast(e.message,true);}
