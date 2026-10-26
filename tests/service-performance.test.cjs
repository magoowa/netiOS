'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function service(files){
    const handlers={};
    class Provider{clear(){}}
    class Service{constructor(){this.activityManager={create(){},complete(){}};}register(name,handler){handlers[name]=handler;}}
    const context={Buffer,Promise,Date,process:{memoryUsage:()=>({rss:52428800,heapUsed:1})},setInterval(){return {unref(){}};},require(name){if(name==='webos-service')return Service;if(name==='./provider')return {Provider};if(name==='./account')return ()=>({});if(name==='./user-config')return ()=>()=>Promise.resolve(null);if(name==='./vault')return {};
        if(name==='fs')return Object.assign({},fs,{readFile(file,options,ready){if(typeof options==='function')ready=options;const text=files[file]&&files[file].shift();if(text===undefined){const e=Error('absent');e.code='ENOENT';return ready(e);}ready(null,text);}});return require(name);}};
    vm.runInNewContext(fs.readFileSync('service/service.js','utf8'),context);
    return ()=>new Promise(resolve=>handlers.performance({sender:'com.netiago.webos',payload:{},respond:resolve}));
}
test('performance panel reports real TV CPU load between samples, RAM from meminfo and the service memory',async()=>{
    const call=service({'/proc/stat':['cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 1 1 1 1\n','cpu  160 0 140 900 0 0 0 0 0 0\n'],'/proc/meminfo':['MemTotal:        2048000 kB\nMemFree: 1 kB\nMemAvailable:     1024000 kB\n','MemTotal:        2048000 kB\nMemAvailable:      512000 kB\n']});
    const first=(await call()).data;assert.equal(first.cpu,null,'The first sample has nothing to compare with');assert.deepEqual(JSON.parse(JSON.stringify(first.memory)),{total:2048000*1024,available:1024000*1024});assert.equal(first.serviceRss,52428800);
    const second=(await call()).data;assert.equal(second.cpu,50,'100 busy ticks out of 200');assert.equal(second.memory.available,512000*1024);
});
test('metrics the system does not expose are null, not estimates',async()=>{
    const call=service({});const result=(await call()).data;assert.equal(result.cpu,null);assert.equal(result.memory,null);
});
