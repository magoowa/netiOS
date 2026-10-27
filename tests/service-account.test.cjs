'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('verified login honors the remember choice, cookie restoration retains it, opting out deletes the legacy vault',async()=>{
 const handlers={},writes=[],removed=[];let saved=null;
 class Provider{clear(){this.auth=null;}acceptFrameSession(){this.auth={};return Promise.resolve();}rpc(ns,method){return Promise.resolve(method==='getUserPackSubscriptions'?[{pack:{name:'Synthetic pack'},accountId:'private-synthetic-id',session:{key:'private-synthetic-key'}}]:null);}}
 class Service{constructor(){this.activityManager={create(name,ready){ready({});},complete(activity,ready){ready();}};}register(name,handler){handlers[name]=handler;}}
 const account={load:async()=>saved,save:async value=>{writes.push(value);saved=value;},signOut:async()=>{saved={username:saved.username,remember:false};}};
 const context={Buffer,Promise,Date,setInterval(){return {unref(){}};},require(name){if(name==='./compat')return {};
  if(name==='webos-service')return Service;if(name==='./provider')return {Provider};if(name==='./account')return ()=>account;if(name==='./user-config')return ()=>()=>Promise.resolve(null);if(name==='./vault')return {};
  if(name==='fs')return Object.assign({},fs,{unlink(file,ready){removed.push(file);ready();}});return require(name);
 }};
 vm.runInNewContext(fs.readFileSync('service/service.js','utf8'),context);
 const call=(method,payload)=>new Promise(resolve=>handlers[method]({sender:'com.netiago.webos',payload,respond:resolve}));
 const credentials={username:'synthetic-user',password:'synthetic-password',remember:true};
 assert.equal((await call('acceptFrameSession',credentials)).returnValue,true);assert.equal(saved.remember,true);assert.equal(saved.password,credentials.password);assert.equal(removed.length,0);
 assert.equal((await call('acceptFrameSession',{session:{},remember:true})).returnValue,true);assert.equal(saved.password,credentials.password);
 assert.equal((await call('acceptFrameSession',{session:{},remember:false})).returnValue,true);assert.equal(saved.remember,false);assert.equal(removed.length,1);assert(removed[0].endsWith('credentials.vault'));
 const count=writes.length;assert.equal((await call('acceptFrameSession',{...credentials,remember:'yes'})).returnValue,false);assert.equal(writes.length,count);
 await call('logout',{});assert.equal(saved.username,credentials.username);assert.equal(saved.password,undefined);
});

test('E0: rejected iframe verification preserves the saved account and serializes concurrent handoffs',async()=>{
 const handlers={},saved={username:'synthetic-user',password:'synthetic-password',remember:true};
 let rejectVerification,loads=0,writes=0;
 class Provider{clear(){this.auth=null;}acceptFrameSession(){return new Promise((resolve,reject)=>{rejectVerification=reject;});}}
 class Service{constructor(){this.activityManager={create(name,ready){ready({});}};}register(name,handler){handlers[name]=handler;}}
 const context={Buffer,Promise,Date,setInterval(){return {unref(){}};},require(name){if(name==='./compat')return {};
  if(name==='webos-service')return Service;if(name==='./provider')return {Provider};
  if(name==='./account')return ()=>({load:async()=>{loads++;return saved;},save:async()=>{writes++;}});
  if(name==='./user-config')return ()=>()=>Promise.resolve(null);if(name==='./vault')return {};return require(name);
 }};
 vm.runInNewContext(fs.readFileSync('service/service.js','utf8'),context);
 const call=()=>new Promise(resolve=>handlers.acceptFrameSession({sender:'com.netiago.webos',payload:{},respond:resolve}));
 const first=call();await Promise.resolve();
 assert.equal((await call()).errorCode,'BUSY');
 rejectVerification(new Error('RPC_13572'));assert.equal((await first).errorCode,'RPC_13572');
 assert.equal(loads,0);assert.equal(writes,0);assert.equal(saved.password,'synthetic-password');
 const retry=call();await Promise.resolve();rejectVerification(new Error('RPC_13404'));
 assert.equal((await retry).errorCode,'RPC_13404');
});
