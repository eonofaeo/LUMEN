import {chromium} from 'playwright';import path from 'node:path';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const root=path.resolve('lumen-free'),out=path.resolve('reports');
const ctx=await chromium.launchPersistentContext(path.resolve('checks/profile-focus-'+Date.now()),{executablePath:path.resolve('checks/browsers/chromium-1248/chrome-win64/chrome.exe'),headless:true,acceptDownloads:true,viewport:{width:1440,height:1000},args:[`--load-extension=${root}`,`--disable-extensions-except=${root}`]});
const passed=[],failures=[],errors=[];let page;
const check=async(name,fn)=>{try{await fn();passed.push(name);console.log('PASS '+name);}catch(error){failures.push({name,error:error.stack});await page?.screenshot({path:path.join(out,'focus-failure.png'),fullPage:true});throw error;}};
try{
 const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');const url='chrome-extension://'+new URL(worker.url()).host+'/newtab.html';page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForSelector('.board');
 const idle=()=>page.waitForFunction(()=>document.body.getAttribute('aria-busy')!=='true');
 const read=()=>page.evaluate(async()=>(await import('./store.js')).loadState());
 const focusClick=async name=>{await page.locator(`[data-focus-action="${name}"]`).click();await idle();};
 await check('Focus dashboard, clock, date, and desktop bounds',async()=>{
  assert(await page.locator('#focusPanel').isVisible());assert.match(await page.locator('#dashboardClock').innerText(),/\d/);assert((await page.locator('#dashboardDate').innerText()).length>3);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'lumen-v1.1-dark.png'),fullPage:true});
 });
 await check('Daily intention persists across reload without markup execution',async()=>{
  await page.locator('#dailyIntention').fill('Finish <the> first draft');await page.locator('#dailyIntention').press('Enter');await idle();assert.equal((await read()).focus.intention,'Finish <the> first draft');await page.reload();await page.waitForSelector('.board');assert.equal(await page.locator('#dailyIntention').inputValue(),'Finish <the> first draft');
 });
 await check('Start, pause, resume, and reset timer across reloads',async()=>{
  await focusClick('toggle');const endAt=(await read()).focus.endAt;assert(endAt>Date.now());await page.reload();await page.waitForSelector('.board');assert.equal((await read()).focus.endAt,endAt);await page.waitForFunction(()=>document.querySelector('#timerTime').textContent!=='25:00');await focusClick('toggle');const paused=(await read()).focus;assert.equal(paused.running,false);assert(paused.remainingSeconds<1500);await focusClick('toggle');assert((await read()).focus.running);await focusClick('reset');assert.equal((await read()).focus.remainingSeconds,1500);
 });
 await check('Custom duration and break presets persist',async()=>{
  await page.locator('#timerPreset').selectOption('custom');await page.locator('#customMinutes').fill('37');await focusClick('custom');assert.equal((await read()).focus.durationMinutes,37);assert.equal(await page.locator('#timerTime').innerText(),'37:00');await page.locator('#timerPreset').selectOption('break:5');await idle();assert.equal((await read()).focus.mode,'break');
 });
 await check('Expired timer counts once across simultaneous dashboard tabs',async()=>{
  await page.locator('#timerPreset').selectOption('focus:25');await idle();const other=await ctx.newPage();await other.goto(url);await other.waitForSelector('.board');
  await page.evaluate(async()=>{const m=await import('./store.js');await m.mutateState(s=>{s.focus.running=true;s.focus.endAt=Date.now()-100;s.focus.remainingSeconds=0;});});
  await page.waitForFunction(async()=>{const s=await(await import('./store.js')).loadState();return !s.focus.running&&s.focus.completedSessions===1;});await other.waitForFunction(()=>document.querySelector('#focusSessionCount').textContent==='1 session today');assert.equal((await read()).focus.completedSessions,1);await other.close();
 });
 await check('Focus mode hides collection, preserves timer, and exits with Escape',async()=>{
  await focusClick('zen');assert(await page.locator('#boards').isHidden());assert(await page.locator('#focusPanel').isVisible());assert(await page.locator('[data-focus-action="zen"]').isVisible());await page.screenshot({path:path.join(out,'lumen-v1.1-focus.png'),fullPage:true});await page.keyboard.press('Escape');assert(await page.locator('#boards').isVisible());
 });
 await check('Search puts results first and restores the focus dashboard when cleared',async()=>{
  await page.locator('#search').fill('Gmail');assert(await page.locator('.dashboard-intro').isHidden());assert(await page.locator('#focusPanel').isHidden());assert.equal(await page.locator('.bookmark').count(),1);await page.locator('#search').fill('');assert(await page.locator('#focusPanel').isVisible());
 });
 await check('Shared page JSON excludes personal focus notes and appearance',async()=>{
  await page.locator('[data-action="page-menu"]').click();const pending=page.waitForEvent('download');await page.getByRole('menuitem',{name:'Export page as JSON',exact:true}).click();const download=await pending;const data=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(data.state.focus,undefined);assert.equal(data.state.settings,undefined);assert.equal(data.state.pages.length,1);
 });
 await check('Native settings links download complete JSON, HTML, and CSV exports',async()=>{
  await page.locator('[data-action="settings"]').click();
  for(const format of ['json','html','csv']){const link=page.locator(`[data-action="export-${format}"]`);assert.equal(await link.evaluate(e=>e.tagName),'A');const pending=page.waitForEvent('download');await link.click();const download=await pending,text=await fs.readFile(await download.path(),'utf8');if(format==='json')assert.equal(JSON.parse(text).state.focus.intention,'Finish <the> first draft');else if(format==='html')assert(text.startsWith('<!DOCTYPE'));else assert(text.startsWith('title,url,'));}
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 });
 await check('List layout, card opacity, and system theme persist and react live',async()=>{
  await page.getByRole('button',{name:'List layout',exact:true}).click();await idle();assert.equal((await read()).settings.layout,'list');await page.locator('[data-action="settings"]').click();await page.locator('[data-setting-theme="system"]').click();await page.locator('[name="surfaceOpacity"]').fill('65');await page.locator('[name="showDomains"]').uncheck();await page.locator('#dialogBody button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.reload();await page.waitForSelector('.board');assert.equal((await read()).settings.surfaceOpacity,65);assert.equal(await page.locator('body').getAttribute('data-layout'),'list');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.body.dataset.theme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.body.dataset.theme==='dark');
 });
 await check('Light theme, mobile dashboard, focus mode, and toolbar stay within viewport',async()=>{
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.body.dataset.theme==='light');await page.screenshot({path:path.join(out,'lumen-v1.1-list.png')});await page.getByRole('button',{name:'Board layout',exact:true}).click();await idle();await page.screenshot({path:path.join(out,'lumen-v1.1-light.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('.tool-rail').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));await page.screenshot({path:path.join(out,'lumen-v1.1-mobile.png')});await focusClick('zen');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.keyboard.press('Escape');
 });
 await check('Focus panel can be hidden and remains available in focus mode',async()=>{
  await page.locator('[data-action="settings"]').click();await page.locator('[name="showFocusPanel"]').uncheck();await page.locator('#dialogBody button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert(await page.locator('#focusPanel').isHidden());await focusClick('zen');assert(await page.locator('#focusPanel').isVisible());await page.keyboard.press('Escape');assert(await page.locator('#focusPanel').isHidden());
 });
 await check('Popup honors appearance and has no uncaught errors',async()=>{
  const popup=await ctx.newPage();popup.on('pageerror',e=>errors.push(e.message));await popup.emulateMedia({colorScheme:'light'});await popup.goto(url.replace('newtab.html','popup.html'));await popup.waitForSelector('#page-select option',{state:'attached'});assert.equal(await popup.locator('body').getAttribute('data-theme'),'light');const height=Math.ceil(await popup.locator('body').evaluate(e=>e.getBoundingClientRect().height));assert(height<=600,'Popup should fit in 600 pixels; actual '+height);await popup.setViewportSize({width:380,height});await popup.screenshot({path:path.join(out,'lumen-v1.1-popup.png'),fullPage:true});await popup.close();assert.deepEqual(errors,[]);
 });
}catch(error){console.error(error.stack);if(!failures.length)failures.push({name:'setup',error:error.stack});}
finally{await fs.writeFile(path.join(out,'focus-browser-checks.json'),JSON.stringify({passed,failures,errors},null,2));await ctx.close();console.log(JSON.stringify({passed:passed.length,failed:failures.length}));if(failures.length)process.exitCode=1;}
