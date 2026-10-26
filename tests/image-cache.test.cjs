'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/image-cache.js','utf8');
function fixture(records=new Map(),fetcher){
 let requests=0;
 const cache={keys:async()=>Array.from(records.keys()).map(url=>({url})),match:async key=>records.get(typeof key==='string'?key:key.url)?.clone(),put:async(key,value)=>{records.set(key,value.clone())},delete:async key=>records.delete(key)};
 const context={URL,Map,Promise,Response,Blob,AbortController,setTimeout,clearTimeout,caches:{open:async()=>cache},fetch:async url=>{requests++;return fetcher?fetcher(url):new Response(new Blob(['synthetic-image'],{type:'image/jpeg'}))},FileReader:class{readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result='data:'+blob.type+';base64,'+Buffer.from(data).toString('base64');this.onload()})}}};
 context.window=context;vm.runInNewContext(source,context);return {api:context.NetiosImages,records,context,requests:()=>requests};
}
const image='https://example.pluscdn.pl/thumbnail.jpg';
test('images survive a new application instance and concurrent consumers share one download',async()=>{
 const first=fixture();const [a,b]=await Promise.all([first.api.source(image),first.api.source(image)]);assert.equal(a,b);assert.match(a,/^data:image\/jpeg;base64,/);assert.equal(first.requests(),1);assert.equal(first.records.size,1);
 const next=fixture(first.records);assert.equal(await next.api.source(image),a);assert.equal(next.requests(),0);
});
test('only public provider images are persisted; local assets and credential-bearing URLs bypass fetch',async()=>{
 const f=fixture();for(const url of ['assets/netios.svg','data:image/png;base64,AA','https://example.invalid/photo.jpg','https://user:password@example.pluscdn.pl/image.jpg','http://example.pluscdn.pl/image.jpg'])assert.equal(await f.api.source(url),url);assert.equal(f.requests(),0);assert.equal(f.records.size,0);
});
test('failed responses, non-images and storage denial retain the native image fallback',async()=>{
 for(const response of [()=>Promise.reject(Error('NETWORK')),()=>new Response('error',{status:500}),()=>new Response('<html>',{headers:{'Content-Type':'text/html'}})]){const f=fixture(new Map(),response);assert.equal(await f.api.source(image),image);assert.equal(f.records.size,0);}
 const denied=fixture();denied.context.caches.open=async()=>{throw Error('DENIED')};assert.match(await denied.api.source(image),/^data:image/);assert.equal(denied.records.size,0);
});
test('persistent cache evicts oldest images at its byte limit',async()=>{
 const records=new Map();for(let i=0;i<3;i++)records.set(image+'?old='+i,new Response('x',{headers:{'Content-Type':'image/jpeg','x-netios-size':String(64*1024*1024)}}));
 const f=fixture(records);await f.api.source(image);assert.equal(records.size,2);assert(!records.has(image+'?old=0'));assert(!records.has(image+'?old=1'));assert(records.has(image));
});
test('at most four image downloads run together',async()=>{
 let active=0,max=0;const f=fixture(new Map(),async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(new Blob(['x'],{type:'image/png'}))});
 await Promise.all(Array.from({length:12},(_,i)=>f.api.source(image+'?n='+i)));assert.equal(max,4);assert.equal(f.requests(),12);
});
test('decode failures evict the cached response and full storage does not hide a downloaded image',async()=>{
 const f=fixture();await f.api.source(image);await f.api.discard(image);assert.equal(f.records.size,0);await f.api.source(image);assert.equal(f.requests(),2);
 const full=fixture();(await full.context.caches.open()).put=async()=>{throw Error('QUOTA')};assert.match(await full.api.source(image),/^data:image/);assert.equal(full.records.size,0);
});
test('saved lists survive a new instance, keep their save time and are removed by sign-out',async()=>{
 const stores=new Map(),open=async name=>{if(!stores.has(name)){const records=new Map();stores.set(name,{keys:async()=>Array.from(records.keys()).map(url=>({url})),match:async key=>records.get(typeof key==='string'?key:key.url)?.clone(),put:async(key,value)=>{records.set(key,value.clone())},delete:async key=>records.delete(key)});}return stores.get(name);};
 const first=fixture();first.context.caches={open,delete:async name=>stores.delete(name)};
 await first.context.NetiosData.set('channels:profile',{items:[{id:'synthetic-c0'}]});
 const next=fixture();next.context.caches=first.context.caches;const saved=await next.context.NetiosData.get('channels:profile');
 assert.deepEqual(saved.value.items.map(c=>c.id),['synthetic-c0']);assert(Number.isFinite(saved.at));assert(await next.context.NetiosData.usage()>0);
 await next.context.NetiosData.clear();assert.equal(await next.context.NetiosData.get('channels:profile'),null);
});
test('a saved size index lets startup skip reading cached images',async()=>{
 const records=new Map([[image+'?a',new Response('x',{headers:{'Content-Type':'image/jpeg','x-netios-size':'5'}})]]),f=fixture(records);let reads=0;
 const values={'netios-images-index':JSON.stringify({[image+'?a']:5})};f.context.localStorage={getItem:k=>values[k]||null,setItem:(k,v)=>{values[k]=v}};
 const cache=await f.context.caches.open(),match=cache.match;cache.match=async key=>{reads++;return match(key)};
 assert.equal(JSON.stringify(await f.api.usage()),JSON.stringify({files:1,bytes:5}));assert.equal(reads,0);
});
test('oversized artwork is shrunk once to the shown width and cached under its own key, replacing an older full-size copy',async()=>{
 const records=new Map([[image,new Response(new Blob(['old-full-size'],{type:'image/jpeg'}),{headers:{'Content-Type':'image/jpeg','x-netios-size':'13'}})]]),f=fixture(records);let drawn=null;
 f.context.createImageBitmap=async()=>({width:2000,height:1125,close(){}});
 f.context.document={createElement:()=>({getContext:()=>({drawImage:(b,x,y,w,h)=>{drawn=[w,h];}}),toBlob:callback=>callback(new Blob(['small'],{type:'image/webp'}))})};
 assert.match(await f.api.source(image,360),/^data:image\/webp;base64,/);assert.deepEqual(drawn,[360,203]);
 const key=image+'?netios-width=360';assert(records.has(key),'Shrunk copy cached under a width key');assert(!records.has(image),'The unused full-size copy is removed');
 assert.equal(f.requests(),0,'The older full-size copy is shrunk without downloading it again');const next=fixture(records);next.context.createImageBitmap=async()=>{throw Error('must not decode again');};assert.match(await next.api.source(image,360),/^data:image\/webp/);assert.equal(next.requests(),0);
});
test('small artwork and missing image APIs keep the original bytes',async()=>{
 const f=fixture();f.context.createImageBitmap=async()=>({width:300,height:169,close(){}});assert.match(await f.api.source(image,360),/^data:image\/jpeg/);
 const plain=fixture();assert.match(await plain.api.source(image,360),/^data:image\/jpeg/);
});
test('channel logos are trimmed to their visible pixels and cached under a trim key',async()=>{
 const f=fixture();let cropped=null;
 f.context.createImageBitmap=async()=>({width:2000,height:1125,close(){}});
 const pixels=(w,h)=>{const data=new Uint8ClampedArray(w*h*4);for(let y=50;y<150;y++)for(let x=100;x<300;x++)data[(y*w+x)*4+3]=255;return data;};
 f.context.document={createElement:()=>{const canvas={width:0,height:0,getContext:()=>({drawImage:(...a)=>{if(a.length===9)cropped=[a[1],a[2],a[3],a[4]];},getImageData:(x,y,w,h)=>({data:pixels(w,h)})}),toBlob:callback=>callback(new Blob(['trimmed'],{type:'image/webp'}))};return canvas;}};
 assert.match(await f.api.source(image,360,true),/^data:image\/webp/);assert.deepEqual(cropped,[100,50,200,100],'Only the opaque area is kept');
 assert(f.records.has(image+'?netios-width=360&netios-trim=1'));
});
