'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync('app/main.js','utf8');
function fixture(){
 const started=[],finish=new Map(),nodes=Array.from({length:10},(_,i)=>{
  const image={name:String.fromCharCode(65+i),complete:false,naturalWidth:0,dataset:{src:'synthetic-'+i}};
  return {offsetTop:Math.floor(i/5)*300,classList:{contains:()=>false},querySelector:()=>image};
 });
 const context={Promise,libraryBackdropGate:Promise.resolve(),libraryGeneration:1,screen:'library',libraryNodes:nodes.slice().reverse(),$:()=>({querySelectorAll:()=>nodes}),updateLibraryImageStatus(){},loadLibraryImage(image){started.push(image.name);return new Promise(resolve=>finish.set(image.name,resolve));}};
 vm.createContext(context);vm.runInContext(main.slice(main.indexOf('    var libraryImageRevision=0;'),main.indexOf('    function orderLibrary(){')),context);
 return {context,started,finish,nodes};
}
test('alphabetical images follow displayed rows even when API nodes arrived in reverse order',async()=>{
 const f=fixture();f.context.observeLibraryImages();await new Promise(setImmediate);assert.deepEqual(f.started,['A','B','C','D','E']);
 for(const name of ['B','C','D','E'])f.finish.get(name)();await new Promise(setImmediate);assert.deepEqual(f.started,['A','B','C','D','E']);
 f.finish.get('A')();await new Promise(setImmediate);assert.deepEqual(f.started,['A','B','C','D','E','F','G','H','I','J']);
});
test('leaving the title cancels remaining image rows',async()=>{
 const f=fixture();f.context.observeLibraryImages();await new Promise(setImmediate);f.context.libraryGeneration++;
 for(const name of ['A','B','C','D','E'])f.finish.get(name)();await new Promise(setImmediate);assert.equal(f.started.length,5);
});

test('episode thumbnails wait until the backdrop has loaded',async()=>{
 const f=fixture();let release;f.context.libraryBackdropGate=new Promise(resolve=>release=resolve);
 f.context.observeLibraryImages();await new Promise(setImmediate);assert.deepEqual(f.started,[]);
 release();await new Promise(setImmediate);assert.deepEqual(f.started,['A','B','C','D','E']);
});
