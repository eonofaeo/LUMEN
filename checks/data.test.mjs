import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDefaultState, normalizeUrl, saveState, loadState, mutateState, uid} from '../lumen-free/store.js';
import {parseImport, mergeImport, exportJson, exportHtml, exportCsv} from '../lumen-free/import-export.js';
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const allLinks=s=>s.pages.flatMap(p=>p.boards.flatMap(b=>b.links));
test('URL validation rejects execution schemes while accepting supported URLs',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','vbscript:run','https://ok.test/a\nb'])assert.throws(()=>normalizeUrl(url));
 for(const url of ['https://example.com/a','ftp://files.example.com/a','mailto:a@example.com','file:///C:/test.txt'])assert(normalizeUrl(url));
 assert.equal(normalizeUrl('example.com'),'https://example.com/');
});
test('Full backup retains settings, wallpaper, trash order, notes, and collapsed boards',async()=>{
 const s=createDefaultState();const link=s.pages[0].boards[0].links.shift();s.pages[0].boards[0].collapsed=true;
 s.trash.push({id:uid(),kind:'link',item:link,pageId:s.pages[0].id,boardId:s.pages[0].boards[0].id,index:0,deletedAt:Date.now()});
 s.settings.customWallpaper='data:image/png;base64,'+'A'.repeat(8000);s.settings.wallpaper='custom';
 s.pages[0].boards[0].links[0].description='note\nwith <markup> and "quotes"';s.pages[0].boards[0].links[0].tags=['a','b'];
 const parsed=parseImport(exportJson(s),'backup.json');assert.equal(parsed.trash[0].index,0);assert(parsed.pages[0].boards[0].collapsed);assert.equal(parsed.settings.customWallpaper,s.settings.customWallpaper);assert.equal(parsed.activePageId,s.activePageId);
 await saveState(s);const loaded=await loadState();assert.equal(loaded.trash[0].index,0);assert.equal(loaded.settings.customWallpaper.length,s.settings.customWallpaper.length);assert(loaded.pages[0].boards[0].collapsed);
});
test('No page, board, bookmark, note or tag truncation',async()=>{
 const s=createDefaultState();s.pages=Array.from({length:210},(_,i)=>({id:uid(),name:'Page '+i,boards:[]}));s.activePageId=s.pages[0].id;
 s.pages[0].boards=Array.from({length:510},(_,i)=>({id:uid(),name:'Board '+i,links:[]}));
 s.pages[0].boards[0].links=Array.from({length:10010},(_,i)=>({id:uid(),title:'Link '+i,url:`https://example.com/${i}`,description:'N'.repeat(i?1:3000),tags:i?[]:Array.from({length:50},(_,n)=>'tag'+n),createdAt:Date.now()}));
 await saveState(s);const loaded=await loadState();assert.equal(loaded.pages.length,210);assert.equal(loaded.pages[0].boards.length,510);assert.equal(loaded.pages[0].boards[0].links.length,10010);assert.equal(loaded.pages[0].boards[0].links[0].description.length,3000);assert.equal(loaded.pages[0].boards[0].links[0].tags.length,50);
});
test('HTML roundtrip preserves page and board membership and safe escaping',()=>{
 const s=createDefaultState();const parsed=parseImport(exportHtml(s),'bookmarks.html');assert.equal(allLinks({pages:parsed.pages}).length,allLinks(s).length);assert.deepEqual(parsed.pages.map(p=>[p.name,p.boards.map(b=>b.name)]),s.pages.map(p=>[p.name,p.boards.map(b=>b.name)]));
 const hostile=parseImport('<DL><DT><A HREF="javascript:alert(1)">Bad</A><DT><A HREF="https://good.test/?a=1&amp;b=2">&lt;Good&gt;</A></DL>','x.html');assert.equal(allLinks(hostile).length,1);assert.equal(allLinks(hostile)[0].title,'<Good>');
});
test('CSV preserves multiline notes, commas, quotes, tags, and folder names',()=>{
 const s=createDefaultState();const l=s.pages[0].boards[0].links[0];l.title='A, "quoted" link';l.description='first\nsecond, "third"';l.tags=['one','two'];const parsed=parseImport(exportCsv(s),'links.csv');const round=parsed.links.find(x=>x.url===l.url);assert.equal(round.description,l.description);assert.equal(round.title,l.title);assert.deepEqual(round.tags,l.tags);assert.equal(round.page,s.pages[0].name);assert.equal(round.board,s.pages[0].boards[0].name);
});
test('Import dedupes across nested and loose URLs without changing preferences',()=>{
 const s=createDefaultState();s.settings.theme='light';const link={id:uid(),title:'Same',url:'https://unique.test/a',tags:[],description:''};const parsed={pages:[{name:'New',boards:[{name:'One',links:[link,{...link,id:uid()}]},{name:'Two',links:[link]}]}],links:[link],settings:{theme:'dark'}};const result=mergeImport(s,parsed);assert.deepEqual(result,{added:1,skipped:3});assert.equal(s.settings.theme,'light');
});
test('Invalid backup and malformed CSV fail without partial mutation',()=>{
 assert.throws(()=>parseImport('{invalid','a.json'));assert.throws(()=>parseImport('title,url\n"unclosed','a.csv'));assert.throws(()=>parseImport('{"pages":[{}]}','a.json'));
});
test('Failed mutations do not replay or change persisted data',async()=>{
 await saveState(createDefaultState());const before=await loadState();let calls=0;await assert.rejects(()=>mutateState(s=>{calls++;s.pages=[];throw Error('intentional');}),/intentional/);assert.equal(calls,1);assert.deepEqual((await loadState()).pages,before.pages);
});
test('LumiList 2.1.3 portability JSON retains folders, ordering, notes, and trashed links',()=>{
 const raw={exportType:'lumilist-bookmark-portability',exportVersion:1,bookmarks:[
 {title:'Second',url:'https://portability.test/second',pageName:'Work',boardName:'Research',pageOrder:0,boardOrder:0,bookmarkOrder:1,status:'active',description:'Keep this note'},
 {title:'Trashed',url:'https://portability.test/trash',pageName:'Work',boardName:'Research',pageOrder:0,boardOrder:0,bookmarkOrder:2,status:'trashed',deletedAt:'2026-10-16T00:00:00Z'},
 {title:'First',url:'https://portability.test/first',pageName:'Work',boardName:'Research',pageOrder:0,boardOrder:0,bookmarkOrder:0,status:'active'},
 ]};
 const parsed=parseImport(JSON.stringify(raw),'lumilist.json');assert.deepEqual(parsed.pages[0].boards[0].links.map(l=>l.title),['First','Second']);assert.equal(parsed.trash.length,1);assert.equal(parsed.pages[0].boards[0].links[1].description,'Keep this note');
 const s=createDefaultState();mergeImport(s,parsed);const imported=s.pages.at(-1);assert.equal(s.trash.at(-1).pageId,imported.id);assert.equal(s.trash.at(-1).boardId,imported.boards[0].id);
});
test('A pasted URL containing commas is not misread as CSV',()=>{
 const parsed=parseImport('https://example.com/search?q=one,two');assert.equal(parsed.links[0].url,'https://example.com/search?q=one,two');
});
