'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('an authenticated service survives background inactivity; explicit lock permits idle cleanup',async()=>{
    let clock=0,tick,provider,completed=0;const handlers={};
    class Provider{constructor(){provider=this;this.auth={session:{id:'synthetic'}};}clear(){this.auth=null;}}
    class Service{constructor(){this.activityManager={create(name,ready){ready({id:'synthetic-activity'});},complete(activity,ready){completed++;ready();}};}register(name,handler){handlers[name]=handler;}}
    const context={Buffer,Promise,Date:{now:()=>clock},setInterval(callback){tick=callback;return {unref(){}};},require(name){if(name==='webos-service')return Service;if(name==='./provider')return {Provider};if(name==='./account')return ()=>({});if(name==='./user-config')return ()=>()=>Promise.resolve(null);if(name==='./vault')return {};if(name==='fs')return Object.assign({},fs,{readFile(file,ready){const e=Error('absent');e.code='ENOENT';ready(e);}});return require(name);}};
    vm.runInNewContext(fs.readFileSync('service/service.js','utf8'),context);
    const call=name=>new Promise(resolve=>handlers[name]({sender:'com.netiago.webos',payload:{},respond:resolve}));
    assert.equal((await call('status')).data.loggedIn,true);clock=3600000;tick();assert(provider.auth);assert.equal(completed,0);
    await call('lock');clock+=61000;tick();assert.equal(provider.auth,null);assert.equal(completed,1);
});
