import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=path.resolve('lumen-free');
const output=path.resolve('reports');
await fs.mkdir(output,{recursive:true});
const profile=path.resolve(`checks/profile-${Date.now()}`);
const ctx=await chromium.launchPersistentContext(profile,{
 executablePath:path.resolve('checks/browsers/chromium-1248/chrome-win64/chrome.exe'),
 headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,
 args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,'--no-first-run'],
});
const failures=[], passed=[], errors=[];
let page;
async function check(name,fn){try{await fn();passed.push(name);console.log('PASS '+name);}catch(e){failures.push({name,error:e.stack});console.error('FAIL '+name+': '+e.message);if(page){console.error('TRACE',JSON.stringify(await page.evaluate(()=>({clicks:window.__clickTrace,toasts:document.querySelector('#toasts')?.innerText})).catch(()=>({}))));await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}throw e;}}
try{
 let worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:20000});
 const id=new URL(worker.url()).host;
 page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__clickTrace=[];document.addEventListener('click',e=>{window.__clickTrace.push({tag:e.target.tagName,action:e.target.closest('[data-action]')?.dataset.action,download:e.target.download});},true);});
 await page.goto(`chrome-extension://${id}/newtab.html`);
 await page.waitForSelector('.board');
 const read=()=>page.evaluate(async()=>{const m=await import('./store.js');return m.loadState();});
 const idle=()=>page.waitForFunction(()=>document.body.getAttribute('aria-busy')!=='true');
 const clickAction=async action=>{await page.locator(`[data-action="${action}"]`).first().click();await idle();};
 const submit=()=>page.locator('#dialogBody button[type="submit"]').click();
 const modalClosed=()=>page.waitForFunction(()=>!document.querySelector('#modal').open);
 await check('MV3 worker, default dashboard and eight Home boards',async()=>{
   assert.equal(await page.locator('.board').count(),8);assert.equal((await read()).pages.length,3);
   assert.equal(await page.locator('#emptyState').isVisible(),false);
   await page.screenshot({path:path.join(output,'lumen-dark.png'),fullPage:true});
 });
 await check('Create page, board, bookmark with notes and tags',async()=>{
   await clickAction('add-page');await page.locator('[name="name"]').fill('Smoke Test');await submit();await modalClosed();
   await clickAction('add-board');await page.locator('[name="name"]').fill('Research');await submit();await modalClosed();
   await clickAction('add-link');await page.locator('[name="url"]').fill('https://example.com/research');await page.locator('[name="title"]').fill('My research');await page.locator('[name="description"]').fill('A useful multi-line\nnote');await page.locator('[name="tags"]').fill('design, reference');await submit();await modalClosed();
   assert.equal(await page.locator('.bookmark').count(),1);
   const s=await read(),p=s.pages.find(p=>p.name==='Smoke Test');assert.deepEqual(p.boards[0].links[0].tags,['design','reference']);
 });
 await check('Undo and redo survive view navigation and privacy toggles',async()=>{
   await clickAction('privacy');await page.locator('.page-tab').first().click();await clickAction('undo');await page.waitForFunction(async()=>{const m=await import('./store.js');return (await m.loadState()).pages.find(p=>p.name==='Smoke Test').boards[0].links.length===0;});
   assert.equal((await read()).pages.find(p=>p.name==='Smoke Test').boards[0].links.length,0);
   await clickAction('redo');await page.waitForFunction(async()=>{const m=await import('./store.js');return (await m.loadState()).pages.find(p=>p.name==='Smoke Test').boards[0].links.length===1;});assert.equal((await read()).pages.find(p=>p.name==='Smoke Test').boards[0].links.length,1);
   await clickAction('privacy');
 });
 await check('Global tag search, exact match, scope, and no-result state',async()=>{
   await page.locator('#search').fill('#reference');assert.equal(await page.locator('.bookmark').count(),1);
   await page.locator('#exactSearch').check();assert.equal(await page.locator('.bookmark').count(),0);assert(await page.locator('#emptyState').isVisible());
   await page.locator('#exactSearch').uncheck();await page.locator('#searchScope').selectOption('page');assert.equal(await page.locator('.bookmark').count(),0);
   await page.locator('#searchScope').selectOption('all');await page.locator('#search').fill('');
 });
 await check('Unsafe URL rejected without committing',async()=>{
   await clickAction('add-link');await page.locator('[name="url"]').fill('javascript:alert(1)');await submit();assert.match(await page.locator('.form-error').innerText(),/scheme|valid/i);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 });
 await check('Edit board preserves order and collapse persists reload',async()=>{
   const before=(await read()).pages[0].boards.map(b=>b.id);
   await page.locator('[data-action="board-menu"]').first().click();await page.getByRole('menuitem',{name:'Edit / move board'}).click();await page.locator('[name="name"]').fill('Daily edited');await submit();await modalClosed();
   assert.deepEqual((await read()).pages[0].boards.map(b=>b.id),before);
   await page.locator('[data-action="collapse"]').first().click();await page.reload();await page.waitForSelector('.board.collapsed');
   assert(await page.locator('.board').first().locator('.links').isHidden());await page.locator('[data-action="collapse"]').first().click();
 });
 await check('Trash restore retains original position after reload',async()=>{
   const before=(await read()).pages[0].boards[0].links.map(l=>l.id);
   await page.locator('.board').first().locator('[data-action="link-menu"]').first().click();await page.getByRole('menuitem',{name:'Move to trash',exact:true}).click();await idle();
   await page.reload();await page.waitForSelector('.board');await clickAction('trash');await page.locator('[data-restore]').first().click();await page.waitForFunction(async()=>{const m=await import('./store.js');return (await m.loadState()).trash.length===0;});
   assert.deepEqual((await read()).pages[0].boards[0].links.map(l=>l.id),before);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 });
 await check('Import text and skip duplicates',async()=>{
   await clickAction('import');await page.locator('textarea[name="text"]').fill('https://example.com/unique-new\nhttps://example.com/unique-new');await submit();await modalClosed();
   assert.equal((await read()).pages.flatMap(p=>p.boards.flatMap(b=>b.links)).filter(l=>l.url==='https://example.com/unique-new').length,1);
 });
 await check('Workspace backup downloads and parses',async()=>{
   await clickAction('settings');const download=page.waitForEvent('download');await clickAction('export-json');const file=await download;const data=JSON.parse(await fs.readFile(await file.path(),'utf8'));assert.equal(data.app,'Lumen Free');assert(data.state.pages.length>=4);await file.saveAs(path.join(output,'test-workspace-backup.json'));await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 });
 await check('Light theme, compact mode, custom wallpaper, privacy and mobile layout',async()=>{
   await clickAction('settings');await page.locator('[data-setting-theme="light"]').click();await page.locator('[name="density"]').selectOption('compact');await page.locator('[name="columns"]').selectOption('3');
   await page.locator('#wallpaperFile').setInputFiles({name:'wallpaper.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmS8AAAAASUVORK5CYII=','base64')});
   await submit();await modalClosed();await page.reload();await page.waitForSelector('.board');assert.equal(await page.locator('body').getAttribute('data-theme'),'light');assert.equal((await read()).settings.wallpaper,'custom');assert((await read()).settings.customWallpaper.length>50);
   await page.screenshot({path:path.join(output,'lumen-light.png'),fullPage:true});
   await clickAction('privacy');assert.equal(await page.locator('.links').first().evaluate(e=>getComputedStyle(e).filter),'blur(7px)');await clickAction('privacy');
   await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('.tool-rail').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));await page.screenshot({path:path.join(output,'lumen-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});
 });
 await check('Concurrent writes from separate contexts are retained',async()=>{
   const other=await ctx.newPage();await other.goto(`chrome-extension://${id}/newtab.html`);await other.waitForSelector('.board');
   const add=target=>target.evaluate(async()=>{const m=await import('./store.js');return m.mutateState(s=>s.pages.push({id:m.uid(),name:'Concurrent '+m.uid(),boards:[]}));});
   const n=(await read()).pages.length;await Promise.all([add(page),add(other)]);assert.equal((await read()).pages.length,n+2);await other.close();
 });
 await check('Drag bookmarks and boards across boards and page tabs',async()=>{
   const before=await read(),home=before.pages[0],work=before.pages[1],link=home.boards[0].links[0];
   await page.locator(`[data-link="${link.id}"]`).scrollIntoViewIfNeeded();
   const destId=await page.locator('[data-board]').evaluateAll((cards,sourceId)=>{const source=cards.find(e=>e.dataset.board===sourceId).getBoundingClientRect();return cards.filter(e=>e.dataset.board!==sourceId).sort((a,b)=>Math.abs(a.getBoundingClientRect().top-source.top)-Math.abs(b.getBoundingClientRect().top-source.top))[0].dataset.board;},home.boards[0].id);
   const dest=home.boards.find(b=>b.id===destId);
   await page.locator(`[data-link="${link.id}"]`).dragTo(page.locator(`[data-board="${dest.id}"] .links`));await idle();
   assert((await read()).pages[0].boards.find(b=>b.id===dest.id).links.some(l=>l.id===link.id));
   const board=home.boards[0];await page.locator(`[data-board="${board.id}"] .board-header`).dragTo(page.locator(`[data-page="${work.id}"]`));await idle();
   assert((await read()).pages[1].boards.some(b=>b.id===board.id));
 });
 await check('Board duplicate review, deduplication, and bulk move',async()=>{
   await page.locator('[data-action="board-menu"]').first().click();await page.getByRole('menuitem',{name:'Duplicate board',exact:true}).click();await idle();
   await clickAction('duplicates');assert(await page.locator('#deduplicate').isVisible());await page.locator('#deduplicate').click();await submit();await modalClosed();
   const urls=(await read()).pages.flatMap(p=>p.boards.flatMap(b=>b.links.map(l=>{const u=new URL(l.url);u.hash='';return u.href.replace(/\/$/,'');})));assert.equal(new Set(urls).size,urls.length);
   await clickAction('select');await page.locator('.link-select').nth(0).check();await page.locator('.link-select').nth(1).check();
   const selectedIds=await page.locator('.link-select:checked').evaluateAll(es=>es.map(e=>e.dataset.select));const dest=(await read()).pages[1].boards[0];await clickAction('move-selected');await page.locator('[name="boardId"]').selectOption(dest.id);await submit();await modalClosed();
   const moved=(await read()).pages[1].boards[0].links.map(l=>l.id);assert(selectedIds.every(id=>moved.includes(id)));
 });
 await check('Background messages save records and handle incognito opening',async()=>{
   const result=await page.evaluate(()=>chrome.runtime.sendMessage({type:'save-links',links:[{title:'Background capture',url:'http://127.0.0.1:1/test',description:'saved from test',tags:['test']}],destination:{createBoardName:'Background Inbox'}}));assert.equal(result.ok,true);assert.equal(result.count,1);
   assert((await read()).pages.flatMap(p=>p.boards.flatMap(b=>b.links)).some(l=>l.title==='Background capture'));
   const open=await page.evaluate(()=>chrome.runtime.sendMessage({type:'open-links',urls:['http://127.0.0.1:1/private'],incognito:true}));
   assert(open.ok===true||typeof open.error==='string');if(open.ok)await worker.evaluate(id=>chrome.windows.remove(id),open.windowId);
 });
 await check('Popup loads in extension origin',async()=>{
   const popup=await ctx.newPage();popup.on('pageerror',e=>errors.push(e.message));await popup.goto(`chrome-extension://${id}/popup.html`);await popup.waitForSelector('#page-select option',{state:'attached'});assert(await popup.locator('#save-tabs-button').isEnabled());await popup.setViewportSize({width:390,height:650});await popup.screenshot({path:path.join(output,'lumen-popup.png')});await popup.close();
 });
 await check('No uncaught page errors',async()=>assert.deepEqual(errors,[]));
}catch(e){if(!failures.length)failures.push({name:'Browser setup',error:e.stack});}
finally{
 await fs.writeFile(path.join(output,'browser-checks.json'),JSON.stringify({date:new Date().toISOString(),passed,failures,errors},null,2));
 await ctx.close();console.log(JSON.stringify({passed:passed.length,failed:failures.length}));
 if(failures.length)process.exitCode=1;
}
