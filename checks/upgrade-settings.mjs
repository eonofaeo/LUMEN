import fs from 'node:fs/promises';
const file='lumen-free/app.js';
let source=await fs.readFile(file,'utf8');
const start=source.indexOf('function showSettings() {'), end=source.indexOf('function showHelp()',start);
if(start<0||end<0)throw Error('Settings function boundary not found.');
const replacement=String.raw`function showSettings() {
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
    '<section class="settings-section"><p class="settings-eyebrow">03 / YOUR DATA</p><h3>A copy to keep</h3><p class="muted">Your bookmarks, preferences, and daily focus stay in this browser profile. Keep a backup for your next device.</p><div class="export-options"><button type="button" class="button secondary" data-action="export-json">'+icon('export',16)+' Full backup · JSON</button><button type="button" class="button secondary" data-action="export-html">Browser HTML</button><button type="button" class="button secondary" data-action="export-csv">CSV</button></div><p id="storageEstimate" class="muted"></p></section>'+buttons('Save preferences')+'</form>',{wide:true});
  let theme=s.theme,wallpaper=s.wallpaper,customWallpaper=s.customWallpaper;
  $$('[data-setting-theme]').forEach(e=>e.addEventListener('click',()=>{theme=e.dataset.settingTheme;$$('[data-setting-theme]').forEach(b=>b.classList.toggle('selected',b===e));}));
  $$('[data-wallpaper-option]').forEach(e=>e.addEventListener('click',()=>{wallpaper=e.dataset.wallpaperOption;$$('[data-wallpaper-option]').forEach(b=>b.classList.toggle('selected',b===e));}));
  $('[name="surfaceOpacity"]').addEventListener('input',e=>{$('#opacityValue').textContent=e.target.value+'%';});
  $('#wallpaperFile').addEventListener('change',safe(async e=>{const file=e.target.files[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type))throw Error('Choose a PNG, JPEG, WebP, GIF, or AVIF image.');customWallpaper=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read this image.'));r.readAsDataURL(file);});wallpaper='custom';$$('[data-wallpaper-option]').forEach(b=>b.classList.remove('selected'));toast('Wallpaper ready. Save preferences to apply.');}));
  if(navigator.storage?.estimate)navigator.storage.estimate().then(({usage})=>{const e=$('#storageEstimate');if(e)e.textContent='Local storage: '+((usage||0)/1024/1024).toFixed(2)+' MB · '+count(state)+' bookmarks · no plan limits';}).catch(()=>{});
  bindForm(async data=>{await commit(s=>{Object.assign(s.settings,{theme,wallpaper,customWallpaper,accent:data.get('accent'),columns:Number(data.get('columns')),density:data.get('density'),layout:data.get('layout'),surfaceOpacity:Number(data.get('surfaceOpacity'))});for(const k of ['showDescriptions','showDomains','showFocusPanel','openInNewTab','privacy','incognito'])s.settings[k]=!!data.get(k);},{history:false});closeDialog();toast('Your workspace, your way.');});
}
`;
source=source.slice(0,start)+replacement+source.slice(end);
source=source.replace('png|jpeg|webp|gif);base64','png|jpeg|webp|gif|avif);base64');
await fs.writeFile(file,source);
let html=await fs.readFile('lumen-free/newtab.html','utf8');
html=html.replace('<div class="workspace-actions"><div id="searchOptions"','<div class="workspace-actions"><div class="layout-switch" role="group" aria-label="Collection layout"><button type="button" data-layout="boards" class="active" aria-label="Board layout" title="Boards" aria-pressed="true">▦</button><button type="button" data-layout="list" aria-label="List layout" title="List" aria-pressed="false">☰</button></div><div id="searchOptions"');
html=html.replace('<p class="eyebrow">A LITTLE ORDER. A LOT OF POSSIBILITY.</p>','<p class="eyebrow">YOUR COLLECTION</p>');
await fs.writeFile('lumen-free/newtab.html',html);
