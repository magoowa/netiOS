'use strict';
const dgram = require('node:dgram'), net = require('node:net'), os = require('node:os');
const readline = require('node:readline/promises'), {Writable} = require('node:stream');
const {spawn} = require('node:child_process'), path = require('node:path'), fs = require('node:fs');

function localAddress(value) {
    if (net.isIP(value) !== 4) return false;
    const [a,b] = value.split('.').map(Number);
    return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31;
}
function discoveryLocation(text, address) {
    try {
        const match = text.match(/^location:\s*(.+)$/im), url = new URL(match && match[1].trim());
        return localAddress(address) && url.protocol === 'http:' && url.hostname === address ? url.href : null;
    } catch { return null; }
}
async function discover() {
    const locations = new Map(), socket = dgram.createSocket('udp4');
    await new Promise(resolve => {
        const timer = setTimeout(() => {socket.close();resolve();}, 2500);
        socket.on('error', () => {clearTimeout(timer);socket.close();resolve();});
        socket.on('message', (message, remote) => {const url=discoveryLocation(message.toString(),remote.address);if(url)locations.set(remote.address,url);});
        socket.bind(0, () => {
            const message=Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n');
            for(const items of Object.values(os.networkInterfaces())) for(const item of items) if(item.family==='IPv4'&&!item.internal&&localAddress(item.address)) {
                try {socket.setMulticastInterface(item.address);socket.send(message,1900,'239.255.255.250');} catch {}
            }
        });
    });
    return (await Promise.all(Array.from(locations,async ([address,url]) => {
        try {
            const response=await fetch(url,{signal:AbortSignal.timeout(2500),redirect:'error'});
            let xml='';for await(const chunk of response.body){xml+=Buffer.from(chunk).toString();if(xml.length>65536)throw Error('DESCRIPTION_TOO_LARGE');}
            if(!/webos|lg electronics|lg smart/i.test(xml))return null;
            const name=(xml.match(/<friendlyName>([^<]*)<\/friendlyName>/i)||[])[1]||'LG webOS';
            return {address,name:name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,100)};
        } catch {return null;}
    }))).filter(Boolean);
}
async function prompt(label, hidden=false) {
    process.stdout.write(label);
    const output=hidden?new Writable({write(chunk,encoding,done){done();}}):process.stdout;
    const rl=readline.createInterface({input:process.stdin,output,terminal:true});
    try {return await rl.question('');} finally {rl.close();if(hidden)process.stdout.write('\n');}
}
async function inject(socket, credentials) {
    let sequence=0;const pending=new Map();
    socket.onmessage=event=>{const message=JSON.parse(event.data);const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);if(message.error)entry.reject(Error('INSPECTOR_REQUEST_FAILED'));else entry.resolve(message.result);};
    const call=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('INSPECTOR_TIMEOUT'));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const target=await call('Runtime.evaluate',{expression:'window'});
    const result=await call('Runtime.callFunctionOn',{objectId:target.result.objectId,functionDeclaration:'function(data){return window.netiOSLogin(data);}',arguments:[{value:credentials}],returnByValue:true});
    if(result.exceptionDetails||result.result.value!==true)throw Error('LOGIN_SCREEN_REQUIRED');
}
async function main() {
    if(typeof WebSocket==='undefined')throw Error('NODE_22_REQUIRED');
    let host=process.argv[2];
    if(!host){
        console.log('Szukam telewizorów LG w sieci…');const items=await discover();
        items.forEach((tv,i)=>console.log(`${i+1}. ${tv.name} (${tv.address})`));
        const selected=await prompt(items.length?'Numer TV lub adres IP: ':'Nie wykryto TV. Podaj adres IP: ');
        host=items[Number(selected)-1]?.address||selected.trim();
    }
    if(!localAddress(host))throw Error('LOCAL_IPV4_REQUIRED');
    const username=await prompt('Login Netia GO: '), password=await prompt('Hasło Netia GO (ukryte): ',true);
    if(!username.trim()||username.length>256||!password||password.length>1024)throw Error('INVALID_CREDENTIALS');
    const credentials={username,password}, port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
    const directory=path.resolve(__dirname,'../.local');fs.mkdirSync(directory,{recursive:true});
    console.log('Łączę przez SSH jako root. Jeśli SSH poprosi o hasło, podaj hasło TV, nie Netia GO.');
    const tunnel=spawn('ssh',['-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','UserKnownHostsFile='+path.join(directory,'injector-known-hosts'),'-L',`127.0.0.1:${port}:127.0.0.1:9998`,'root@'+host,
        'luna-send -n 1 luna://com.webos.applicationManager/launch \'{"id":"com.netiago.webos","params":{"inspect":true}}\' >/dev/null; sleep 600'],{stdio:['inherit','ignore','inherit']});
    let closed=false,socket;tunnel.on('error',()=>{closed=true;});tunnel.on('exit',()=>{closed=true;});
    try {
        let target;
        for(let n=0;n<600&&!closed&&!target;n++){
            try {const list=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(300)})).json();target=list.find(item=>item.url.includes('/com.netiago.webos/'));}catch {}
            if(!target)await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!target)throw Error('SSH_OR_APP_INSPECTOR_UNAVAILABLE');
        const endpoint=new URL(target.webSocketDebuggerUrl);endpoint.hostname='127.0.0.1';endpoint.port=String(port);
        socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('INSPECTOR_TIMEOUT')),5000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(Error('INSPECTOR_CONNECTION_FAILED'));};});
        await inject(socket,credentials);console.log('Dane przekazane. Dokończ logowanie w netiOS na TV; ewentualna weryfikacja pozostaje na TV.');
    } finally {credentials.username='';credentials.password='';if(socket)socket.close();tunnel.kill();}
}
module.exports={localAddress,discoveryLocation,discover,inject};
if(require.main===module)main().catch(error=>{console.error('Nie udało się przekazać danych. Kod: '+(/^[A-Z_0-9]+$/.test(error.message)?error.message:'INJECTOR_FAILED'));process.exitCode=1;});
