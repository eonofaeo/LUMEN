import {chromium} from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
const ext=path.resolve('lumen-free');
const profile=path.resolve('checks/profile-probe');
const browser=await chromium.launchPersistentContext(profile,{
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],
});
try {
  let worker=browser.serviceWorkers()[0];
  if(!worker)try{worker=await browser.waitForEvent('serviceworker',{timeout:12000});}catch{}
  console.log(JSON.stringify({workers:browser.serviceWorkers().map(w=>w.url()),version:browser.browser()?.version(),pages:browser.pages().map(p=>p.url())}));
}finally{await browser.close();}
