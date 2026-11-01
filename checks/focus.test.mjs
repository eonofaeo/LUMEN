import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFocus,localDateKey,startTimer,pauseTimer,resetTimer,chooseDuration,secondsLeft,finishTimer} from '../lumen-free/focus-state.js';
import {createDefaultState,saveState,loadState} from '../lumen-free/store.js';
import {exportJson,parseImport,mergeImport} from '../lumen-free/import-export.js';
const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};

test('Timer deadline survives serialization, pause, resume, and reset',()=>{
 const focus=normalizeFocus();startTimer(focus,100000);assert.equal(focus.endAt,1600000);assert.equal(secondsLeft(focus,110000),1490);
 const restored=normalizeFocus(JSON.parse(JSON.stringify(focus)));pauseTimer(restored,110000);assert.equal(restored.remainingSeconds,1490);assert.equal(restored.running,false);
 startTimer(restored,200000);assert.equal(restored.endAt,1690000);resetTimer(restored);assert.equal(restored.endAt,null);assert.equal(restored.remainingSeconds,1500);
});
test('Completed focus sessions count once; breaks do not count',()=>{
 const now=Date.now(),focus=normalizeFocus();startTimer(focus,now);assert.equal(finishTimer(focus,now+1499000),false);assert(finishTimer(focus,now+1500000));assert.equal(focus.completedSessions,1);assert.equal(finishTimer(focus,now+1500010),false);assert.equal(focus.completedSessions,1);
 chooseDuration(focus,'break',5);startTimer(focus,now);assert(finishTimer(focus,now+300000));assert.equal(focus.completedSessions,1);
});
test('Daily counts reset on completion in a new local day',()=>{
 const now=new Date(2026,9,18,10).getTime(),focus=normalizeFocus({sessionDate:'2026-10-17',completedSessions:4});startTimer(focus,now);finishTimer(focus,now+1500000);assert.equal(focus.sessionDate,localDateKey(new Date(now)));assert.equal(focus.completedSessions,1);
});
test('Malformed timer state is safe and durations validate',()=>{
 assert.equal(normalizeFocus(null).running,false);assert.equal(normalizeFocus({running:true,endAt:'bad',remainingSeconds:-1}).remainingSeconds,1500);const focus=normalizeFocus();assert.throws(()=>chooseDuration(focus,'focus',0));assert.throws(()=>chooseDuration(focus,'focus',NaN));chooseDuration(focus,'focus',37);assert.equal(focus.remainingSeconds,2220);
});
test('Old workspaces gain focus defaults and new preferences without losing links',async()=>{
 const old=createDefaultState();delete old.focus;delete old.settings.layout;delete old.settings.surfaceOpacity;const urls=old.pages[0].boards[0].links.map(l=>l.url);await saveState(old);const next=await loadState();assert.equal(next.settings.layout,'boards');assert.equal(next.settings.showFocusPanel,true);assert.equal(next.focus.durationMinutes,25);assert.deepEqual(next.pages[0].boards[0].links.map(l=>l.url),urls);
});
test('JSON backup preserves focus and appearance; append import preserves current focus',async()=>{
 const state=createDefaultState();state.focus.intention='Finish the first draft';state.focus.completedSessions=3;startTimer(state.focus);Object.assign(state.settings,{layout:'list',surfaceOpacity:65,theme:'system',showDomains:false,showFocusPanel:false});
 await saveState(state);const saved=await loadState(),parsed=parseImport(exportJson(saved),'backup.json');assert.deepEqual(parsed.focus,saved.focus);assert.equal(parsed.settings.layout,'list');assert.equal(parsed.settings.surfaceOpacity,65);assert.equal(parsed.settings.showFocusPanel,false);
 const other=createDefaultState();other.focus.intention='Keep my current focus';mergeImport(other,parsed);assert.equal(other.focus.intention,'Keep my current focus');
});
