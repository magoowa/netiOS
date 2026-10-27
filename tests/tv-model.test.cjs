'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const m = require('../app/tv-model');
test('each channel view retains its sort mode and older preferences migrate without losing the selected order',()=>{
 const p=m.preferences({sort:'thematic',channelSort:{all:'alphabetical',favorites:'favorites-first',hidden:'thematic'},librarySort:{series:'genres',shows:'alphabetical'}});
 assert.deepEqual(p.channelSort,{all:'alphabetical',favorites:'favorites-first',hidden:'thematic'});assert.equal(p.librarySort.series,'genres');
 assert.deepEqual(m.preferences({sort:'thematic'}).channelSort,{all:'thematic',favorites:'thematic',hidden:'thematic'});
});
test('catalogue sort uses Polish titles or primary genre, preserving independent validated list preferences',()=>{
    const items=[{id:'z',title:'Żółw',genres:['Dramat']},{id:'a',title:'Animacja',genres:['Familijny']},{id:'n',title:'Bez gatunku'}];
    assert.deepEqual(m.catalogue(items,'alphabetical').map(x=>x.id),['a','n','z']);assert.deepEqual(m.catalogue(items,'genres').map(x=>x.id),['z','a','n']);
    assert.deepEqual(m.preferences({sort:'favorites-first',librarySort:{series:'genres',shows:'invalid'}}).librarySort,{series:'genres',shows:'alphabetical'});assert.equal(items[0].id,'z');
});
test('hidden channels never appear in all/favorites; hidden view can restore them', () => {
    const items = [{id: 'a'}, {id: 'b'}, {id: 'c'}], p = m.preferences({favorites: ['a', 'b', 'b', 7], hidden: ['b']});
    assert.deepEqual(m.channels(items, p, 'all').map(c => c.id), ['a', 'c']);
    assert.deepEqual(m.channels(items, p, 'favorites').map(c => c.id), ['a']);
    assert.deepEqual(m.channels(items, p, 'hidden').map(c => c.id), ['b']);
    assert.equal(m.preferences({subtitleSize: 999}).subtitleSize, 100);
});
test('guide search matches all words in title, description or channel, including Polish letters', () => {
    const items = [{title: 'Żółw', description: 'Podróż przez świat', channelTitle: 'Kanał 2'}, {title: 'Film', description: 'Komedia', channelTitle: 'Kanał 1'}];
    assert.deepEqual(m.search(items, 'zolw swiat'), [items[0]]);
    assert.deepEqual(m.search(items, 'kanal 1'), [items[1]]);
    assert.equal(m.search(items, '').length, 2);
});
test('transport clamps to the actual live seek window and program boundaries do not overlap', () => {
    assert.equal(m.seek(2, {start: 10, end: 30}), 10);
    assert.equal(m.seek(50, {start: 10, end: 30}), 30);
    assert.equal(m.seek(NaN, {start: 10, end: 30}), null);
    assert.equal(m.seek(20, {start: 30, end: 10}), null);
    const items = [{start: 10, end: 20}, {start: 20, end: 30}];
    assert.equal(m.at(items, 20), items[1]); assert.equal(m.at(items, 30), null);
});
test('programme restart and divisions respect the actual stream seek window',()=>{
 const model=require('../app/tv-model'),origin=Date.UTC(2026,9,23,12),window=model.buffer({start:60,end:3600},origin+600000,600);
 assert.equal(model.programmePosition(origin+120000,window),120);assert.equal(model.programmePosition(origin,window),null);assert.equal(model.programmePosition(origin+3600000,window),null);assert.equal(model.programmePosition(origin,window,origin+3600000),(window.start-origin)/1000,'A running programme begun before the buffer starts at the earliest buffered moment');assert.equal(model.programmePosition(origin,window,window.start),null,'A programme that ended before the buffer is still unavailable');assert.equal(model.programmePosition(origin+120000,window,origin+999999),120,'Starts inside the buffer are unchanged');
 assert.equal(model.buffer({start:0,end:0},origin,0),null);
 const parts=model.segments([{title:'past',start:origin,end:origin+120000},{title:'outside',start:origin-500000,end:origin-1}],window);assert.equal(parts.length,1);assert.equal(parts[0].left,0);assert(parts[0].width>0&&parts[0].width<100);
});

test('channel sort modes use Polish names, stable thematic groups and favorites before the rest',()=>{
 const items=[{id:'c',title:'Żaba',category:'Sport'},{id:'b',title:'Alfa',category:'Wiadomości'},{id:'a',title:'Kanał 2',category:'Sport'}];
 const prefs=m.preferences({favorites:['c'],sort:'alphabetical'});assert.deepEqual(m.channels(items,prefs,'all').map(x=>x.id),['b','a','c']);
 prefs.sort='thematic';assert.deepEqual(m.channels(items,prefs,'all').map(x=>x.id),['a','c','b']);
 prefs.sort='favorites-first';assert.deepEqual(m.channels(items,prefs,'all').map(x=>x.id),['c','b','a']);assert.equal(m.preferences({sort:'invalid'}).sort,'alphabetical');assert.equal(m.preferences({sort:'default',channelSort:{all:'default'}}).channelSort.all,'alphabetical');
});

test('channel names sort naturally without quality suffixes or station exceptions',()=>{
 const items=[{id:'10',title:'TVP 10',lcn:1},{id:'2',title:'TVP 2',lcn:90},{id:'1',title:'TVP 1',lcn:100},{id:'p',title:'Polsat',lcn:12},{id:'ps',title:'Polsat Sport',lcn:30},{id:'pn',title:'Polsat News',lcn:20},{id:'t',title:'TV Puls'},{id:'c',title:'CANAL+ Sport',sourceOrder:0},{id:'cf',title:'CANAL+ Film',sourceOrder:9}];
 const p=m.preferences();assert.equal(p.sort,'alphabetical');
 assert.deepEqual(m.channels([{id:'2',title:'Polsat 2',lcn:1},{id:'p',title:'Polsat HD',lcn:90}],p,'all').map(c=>c.id),['p','2']);
 assert.deepEqual(m.channels(items,p,'all').map(c=>c.id),['cf','c','p','pn','ps','t','1','2','10']);
 p.sort='alphabetical';assert.deepEqual(m.channels(items,p,'all').filter(c=>c.id==='pn'||c.id==='ps').map(c=>c.id),['pn','ps']);
 const categorized=[{id:'p',title:'Polsat',category:'Ogólne',lcn:3},{id:'ps',title:'Polsat Sport',category:'Sport',lcn:1},{id:'t',title:'TVP 1',category:'Ogólne',lcn:2}];
 p.sort='thematic';assert.deepEqual(m.channels(categorized,p,'all').map(c=>c.id),['p','t','ps']);
 assert.deepEqual(items.map(c=>c.id),['10','2','1','p','ps','pn','t','c','cf']);
});

test('catalogue search works without channel fields and does not match absent metadata',()=>{
 const items=[{title:'Żółw i świat'},{title:'Inny serial',description:'Opis'}];assert.deepEqual(m.search(items,'zolw swiat'),[items[0]]);assert.deepEqual(m.search(items,'undefined'),[]);
});

test('catalogue groups use the primary genre, retain every item once and omit empty search groups',()=>{
 const items=[{id:'a',title:'A',genres:['Dramat','Komedia']},{id:'b',title:'B',genres:['Dramat']},{id:'c',title:'C',genres:['Przyroda']},{id:'d',title:'D'}];
 const groups=m.catalogueGroups(items,'genres');assert.deepEqual(groups.map(g=>g.key),['Dramat','Przyroda','']);
 assert.deepEqual(groups.map(g=>g.items.length),[2,1,1]);assert.equal(new Set(groups.flatMap(g=>g.items.map(i=>i.id))).size,4);
 assert.deepEqual(m.catalogueGroups(m.search(items,'C'),'genres').map(g=>g.key),['Przyroda']);assert.deepEqual(m.catalogueGroups([], 'genres'),[]);
});

test('seasons and episodes sort numerically, unknown seasons remain unnumbered and root preferences stay separate',()=>{
 const items=[{id:'a',title:'A',season:{number:10},episodeNumber:2},{id:'b',title:'Z',season:{number:2},episodeNumber:10},{id:'c',title:'Y',season:{number:2},episodeNumber:2},{id:'d',title:'Unknown'}];
 assert.deepEqual(m.catalogue(items,'seasons').map(i=>i.id),['c','b','a','d']);assert.deepEqual(m.catalogueGroups(items,'seasons').map(g=>g.key),['2','10','']);
 assert.deepEqual(m.catalogueGroups([items[3]],'seasons').map(g=>g.key),['']);assert.equal(m.preferences({librarySort:{series:'seasons'}}).librarySort.series,'alphabetical');
});

test('episode captions remove only repeated parent prefixes and retain single-item identification',()=>{
 assert.equal(m.episodeTitle('Policjanci – Policjanci odcinek 1308','Policjanci',10),'Odcinek 1308');
 assert.equal(m.episodeTitle('Gliniarze. Śląsk - Odcinek 2','Gliniarze. Śląsk',10),'Odcinek 2');
 assert.equal(m.episodeTitle('Policjancię - Inny tytuł','Policjanci',10),'Policjancię - Inny tytuł');
 assert.equal(m.episodeTitle('nazwa bez prefiksu','Policjanci',10),'nazwa bez prefiksu');
 assert.equal(m.episodeTitle('Policjanci i ich rodziny','Policjanci',10),'Policjanci i ich rodziny');
 assert.equal(m.episodeTitle('Policjanci','Policjanci',1),'Policjanci');assert.equal(m.episodeTitle('Policjanci - 1','Policjanci',1),'Policjanci - 1');
});

test('natural order follows each available package, including unseen families and quality variants',()=>{
 const titles=['Polsat News Polityka','Cinemax 2','Discovery 10 HD','Nowa Marka 2 UHD','Polsat News 2','Discovery 2 4K','Cinemax HD','Nowa Marka HD','Polsat News HD','Discovery HD','Nowa Marka 4K'];
 const items=titles.map((title,i)=>({title,id:String(i),lcn:i})),prefs=m.preferences();
 const ordered=m.channels(items,prefs,'all').map(c=>c.title);
 assert.deepEqual(ordered,['Cinemax HD','Cinemax 2','Discovery HD','Discovery 2 4K','Discovery 10 HD','Nowa Marka 4K','Nowa Marka HD','Nowa Marka 2 UHD','Polsat News HD','Polsat News 2','Polsat News Polityka']);
 assert.deepEqual(m.channels(items.slice(0,6),prefs,'all').map(c=>c.title),['Cinemax 2','Discovery 2 4K','Discovery 10 HD','Nowa Marka 2 UHD','Polsat News 2','Polsat News Polityka']);
 prefs.favorites=['4'];prefs.sort='favorites-first';assert.equal(m.channels(items,prefs,'all')[0].title,'Polsat News 2');
});
test('episode prefixes accept equivalent dashes and spacing without stripping distinct titles',()=>{
 assert.equal(m.episodeTitle('Sprawiedliwi - Wydział Kryminalny – Sprawiedliwi — Wydział Kryminalny odcinek 1308','Sprawiedliwi – Wydział Kryminalny',20),'Odcinek 1308');
 assert.equal(m.episodeTitle('Serial (PL) - Tajemnica','Serial (PL)',2),'Tajemnica');
 assert.equal(m.episodeTitle('Serializacja - Tajemnica','Serial',2),'Serializacja - Tajemnica');
});

test('episode names normalize punctuation and edition counters globally while preserving distinct titles',()=>{
 for(const [parent,title,expected] of [
  ['Bez pudru czyli Kabaret plus…','Bez pudru, czyli kabaret plus… - Odcinek 1','Odcinek 1'],
  ['Kabaret na żywo. Młodzi i Moralni','Kabaret na żywo. Młodzi i moralni 5 - Odcinek 3','Odcinek 3'],
  ['Nowy program','Nowy program 12 - Odcinek 2','Odcinek 2'],
  ['Nowy program','Nowy program 12 - Wyjątkowa historia','Nowy program 12 - Wyjątkowa historia'],
  ['Kabaret na żywo. Młodzi i Moralni','Kabaret na żywo. Kabaret Skeczów Męczących. 20-lecie','Kabaret na żywo. Kabaret Skeczów Męczących. 20-lecie'],
  ['Seria: nowy rozdział!','SERIA, nowy rozdział... — Epizod 10','Epizod 10'],
  ['Program','Program 3 - Część 4','Część 4']
 ])assert.equal(m.episodeTitle(title,parent,10),expected);
 for(const number of [1,2,3,4,5])assert.equal(m.episodeTitle('Kabaret na żywo. Młodzi i moralni'+(number<4?' 5':'')+' - Odcinek '+number,'Kabaret na żywo. Młodzi i Moralni',6),'Odcinek '+number);
});

test('VOD time uses padded hours without wrapping at 24 hours and rejects unavailable duration',()=>{
 assert.equal(m.playbackTime(0),'00:00:00');assert.equal(m.playbackTime(3661.9),'01:01:01');assert.equal(m.playbackTime(90061),'25:01:01');assert.equal(m.playbackTime(Infinity),null);assert.equal(m.playbackTime(NaN),null);assert.equal(m.playbackTime(-1),null);
});
test('saved lists are reused only while fresh and well formed',()=>{
 const saved={at:1000,value:{items:[{id:'synthetic-series'}]}};
 assert.deepEqual(m.savedList(saved,86400000,1000+3600000).map(x=>x.id),['synthetic-series']);
 assert.equal(m.savedList(saved,86400000,1000+86400000),null,'A day-old catalogue is fetched again');
 assert.equal(m.savedList(saved,86400000,500),null,'A save time in the future is not trusted');
 for(const value of [null,{at:1000},{at:1000,value:{items:[]}},{at:1000,value:{items:'x'}},{at:'1000',value:{items:[{}]}}])assert.equal(m.savedList(value,Infinity,2000),null);
 assert.equal(m.savedList(saved,Infinity,1e15).length,1,'Channels have no expiry and refresh in the background');
});

test('next/previous episode follows season and episode order and skips categories', () => {
 const items=[{id:'e3',title:'C',season:{number:1},episodeNumber:3},{id:'s2',title:'Sezon 2',category:true},{id:'e1',title:'A',season:{number:1},episodeNumber:1},{id:'e4',title:'D',season:{number:2},episodeNumber:1},{id:'e2',title:'B',season:{number:1},episodeNumber:2}];
 assert.equal(m.adjacentEpisode(items,'e2',1).id,'e3');
 assert.equal(m.adjacentEpisode(items,'e3',1).id,'e4');
 assert.equal(m.adjacentEpisode(items,'e1',-1),null);
 assert.equal(m.adjacentEpisode(items,'e4',1),null);
 assert.equal(m.adjacentEpisode(items,'missing',1),null);
});

test('live |< and >| jump between programme starts inside the buffer, with the buffer start and live edge as limits', () => {
 const t=Date.UTC(2026,9,26,18),min=60000,window={start:t+10*min,end:t+120*min,origin:t};
 const programs=[{title:'A',start:t,end:t+30*min},{title:'B',start:t+30*min,end:t+60*min},{title:'C',start:t+60*min,end:t+150*min}];
 // Inside B for a while: back to the start of B; forward to the start of C.
 assert.equal(m.segmentPosition(programs,window,t+45*min,-1),30*60);
 assert.equal(m.segmentPosition(programs,window,t+45*min,1),60*60);
 // Just after B started: back to A, which began before the buffer, so the earliest buffered moment.
 assert.equal(m.segmentPosition(programs,window,t+30*min+2000,-1),10*60);
 // In C, whose end is not buffered yet: forward goes to the live edge.
 assert.equal(m.segmentPosition(programs,window,t+90*min,1),120*60);
 // No guide data: back falls back to the buffer start, forward to the live edge.
 assert.equal(m.segmentPosition([],window,t+90*min,-1),10*60);
 assert.equal(m.segmentPosition([],window,t+90*min,1),120*60);
 assert.equal(m.segmentPosition(programs,null,t,1),null);
});
test('the Hidden folder PIN keeps only a hash-shaped value',()=>{
 const m=require('../app/tv-model.js');
 assert.equal(m.preferences({hiddenPin:'0a1b2c3d'}).hiddenPin,'0a1b2c3d');
 for(const value of ['1234','0A1B2C3D',12345678,null,undefined])assert.equal(m.preferences({hiddenPin:value}).hiddenPin,null);
});
