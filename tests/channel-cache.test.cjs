'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(saved){
 const source=fs.readFileSync('app/main.js','utf8'),store=new Map(saved?[['channels:netia-prefs:synthetic',{at:1,value:{items:saved}}]]:[]),calls=[],renders=[],removed=[];let answer;
 const context={Promise,JSON,Date,Error,Object,Array,Infinity,TVModel:require('../app/tv-model'),T:require('../app/texts'),libraryCache:{},libraryScope:null,artworkQueue:[],libraryGeneration:0,channelItems:[],channelNodes:{},prefs:{channelSort:{all:'alphabetical'}},channelMode:'all',screen:'channels',modal:null,saveAfterLogin:false,preferenceKey:null,pointerFocusing:false,scrolls:[],Scrolling:{target:()=>540,to:(el,top,animate)=>context.scrolls.push([top,animate])},
  document:{activeElement:{dataset:{}}},nodes:{},loginStage(){},show(){},focusChannel(){},refreshPrograms(){},syncClock(){},focusControl(){},notice:error=>calls.push('notice:'+error.message),loadUserConfig:async()=>{},
  $:id=>context.nodes[id]||(context.nodes[id]={}),renderChannels:()=>renders.push(context.channelItems.map(c=>c.id).join()),
  loadPreferences:status=>{context.preferenceKey='netia-prefs:'+status.preferenceKey;},
  NetiosData:{get:async key=>store.get(key)||null,set:async(key,value)=>{store.set(key,{at:1,value:JSON.parse(JSON.stringify(value))});},remove:async key=>{removed.push(key);store.delete(key);}},
  rpc:async method=>{calls.push(method);if(method==='status')return {preferenceKey:'synthetic',catalogueTotal:1};if(method==='channels')return new Promise(resolve=>{answer=resolve;});throw new Error('UNEXPECTED_CALL');}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf("    // mode 'refresh'"),source.indexOf('    function refreshPrograms() {')),context);
 return {context,store,calls,renders,removed,answer:items=>{answer(items);return new Promise(r=>setImmediate(r));}};
}
const list=(...ids)=>ids.map(id=>({id,title:id}));
test('a saved channel list renders before Netia answers and is replaced only when the answer differs',async()=>{
 const f=fixture(list('synthetic-a','synthetic-b'));await f.context.channels();
 assert.deepEqual(f.renders,['synthetic-a,synthetic-b'],'Saved channels show without waiting for Netia');
 await f.answer(list('synthetic-a','synthetic-c'));
 assert.deepEqual(f.renders,['synthetic-a,synthetic-b','synthetic-a,synthetic-c']);assert.deepEqual(f.context.scrolls,[[540,false]],'The rebuilt grid stays where the viewer left it');
 assert.deepEqual(f.store.get('channels:netia-prefs:synthetic').value.items.map(c=>c.id),['synthetic-a','synthetic-c']);
 const same=fixture(list('synthetic-a'));await same.context.channels();await same.answer(list('synthetic-a'));assert.equal(same.renders.length,1,'An unchanged answer does not rebuild the grid');
});
test('without a saved list, or on Refresh, channels wait for Netia; Refresh also drops saved catalogues',async()=>{
 const f=fixture(null),pending=f.context.channels();await new Promise(r=>setImmediate(r));assert.deepEqual(f.renders,[]);
 await f.answer(list('synthetic-a'));await pending;assert.deepEqual(f.renders,['synthetic-a']);assert(f.store.has('channels:netia-prefs:synthetic'));
 const refresh=fixture(list('synthetic-old')),done=refresh.context.channels('refresh');await new Promise(r=>setImmediate(r));
 assert.deepEqual(refresh.renders,[],'Refresh never shows the saved list');assert.deepEqual(refresh.removed,['library:netia-prefs:synthetic:series','library:netia-prefs:synthetic:shows']);
 await refresh.answer(list('synthetic-new'));await done;assert.deepEqual(refresh.renders,['synthetic-new']);
});
test('a failed background refresh keeps the saved list and reports the error once',async()=>{
 const f=fixture(list('synthetic-a'));f.context.rpc=async method=>{f.calls.push(method);if(method==='status')return {preferenceKey:'synthetic',catalogueTotal:1};throw new Error('RPC_13404');};
 await f.context.channels();await new Promise(r=>setImmediate(r));
 assert.deepEqual(f.renders,['synthetic-a']);assert.equal(f.calls.filter(c=>c==='notice:RPC_13404').length,1);
});
