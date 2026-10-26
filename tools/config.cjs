'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const validate=require('../service/config-model'),{localAddress}=require('./inject-login.cjs');
const remote='/media/internal/com.netiago.webos/user-config.json';
function main(args){
    const [mode,address,file=path.resolve('user-config.json')]=args;
    if(!['pull','push'].includes(mode)||!localAddress(address))throw Error('USAGE: node tools/config.cjs pull|push TV_IP [FILE]');
    let content;if(mode==='push'){content=fs.readFileSync(file,'utf8');if(content.length>1048576)throw Error('CONFIG_INVALID');validate(JSON.parse(content));}
    const command=mode==='pull'?'cat '+remote:'cp -p '+remote+' '+remote+'.new && cat > '+remote+'.new && mv '+remote+'.new '+remote;
    const result=spawnSync('ssh',['root@'+address,command],{encoding:'utf8',input:content,maxBuffer:1048576,stdio:mode==='pull'?['inherit','pipe','inherit']:['pipe','inherit','inherit']});
    if(result.error||result.status!==0)throw Error('CONFIG_TRANSFER_FAILED');
    if(mode==='pull'){validate(JSON.parse(result.stdout));fs.writeFileSync(file,result.stdout,{mode:0o600});}
    console.log(mode==='pull'?'Konfiguracja pobrana.':'Konfiguracja wysłana. netiOS zastosuje zmianę na aktywnym profilu.');
}
if(require.main===module)try{main(process.argv.slice(2));}catch(error){console.error(error.message.startsWith('USAGE:')?error.message:'Nie udało się przesłać konfiguracji. Sprawdź JSON i połączenie SSH.');process.exitCode=1;}
