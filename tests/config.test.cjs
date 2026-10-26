'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const validate=require('../service/config-model'),store=require('../service/user-config');
const example=require('../config/user-config.example.json');
test('SSH config upload rejects credential fields locally before starting a connection',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'netios-config-cli-'));
 try{const file=path.join(directory,'config.json');fs.writeFileSync(file,JSON.stringify({...example,password:'synthetic-secret'}));
 const result=require('node:child_process').spawnSync(process.execPath,['tools/config.cjs','push','192.168.1.2',file],{encoding:'utf8',timeout:3000});assert.equal(result.status,1);assert(!result.error);assert(!result.stdout.includes('synthetic-secret'));assert(!result.stderr.includes('synthetic-secret'));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('editable configuration validates public fields and rejects credential/PIN fields at every level',()=>{
 const value={...example,channels:[{id:'synthetic-channel',name:'Synthetic channel',favorite:true,hidden:false}]};assert.equal(validate(value),value);
 for(const field of ['password','pin','username','cookies','token']){assert.throws(()=>validate({...value,[field]:'synthetic'}),/CONFIG_INVALID/);assert.throws(()=>validate({...value,channels:[{...value.channels[0],[field]:'synthetic'}]}),/CONFIG_INVALID/);}
 assert.throws(()=>validate({...value,channels:[...value.channels,...value.channels]}),/CONFIG_INVALID/);
 assert.throws(()=>validate({...value,channelSort:{...value.channelSort,all:'invalid'}}),/CONFIG_INVALID/);
});
test('configuration is created once, survives UI defaults changes and detects semantic remote edits',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'netios-config-'));
 try{const read=store(directory),first=await read(example),file=path.join(directory,'user-config.json');
 assert.equal((await read({...example,oledMinutes:120})).revision,first.revision);
 const edited={...example,oledMinutes:60};fs.writeFileSync(file,JSON.stringify(edited));const second=await read();assert.notEqual(second.revision,first.revision);assert.equal(second.settings.oledMinutes,60);
 fs.writeFileSync(file,JSON.stringify(edited,null,4));assert.equal((await read()).revision,second.revision);
 fs.writeFileSync(file,'{"password":"synthetic"}');await assert.rejects(read(),/CONFIG_INVALID/);assert.equal(fs.readFileSync(file,'utf8'),'{"password":"synthetic"}');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('older files with the removed default channel sort load as alphabetical instead of failing validation',async()=>{
 const legacy={...example,channelSort:{all:'default',favorites:'thematic',hidden:'default'}};
 assert.deepEqual(validate(JSON.parse(JSON.stringify(legacy))).channelSort,{all:'alphabetical',favorites:'thematic',hidden:'alphabetical'});
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'netios-config-legacy-'));
 try{fs.writeFileSync(path.join(directory,'user-config.json'),JSON.stringify(legacy));const read=store(directory);assert.equal((await read()).settings.channelSort.all,'alphabetical');}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});
