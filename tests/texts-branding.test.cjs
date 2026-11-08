'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const strings=require('../app/strings.json'),text=require('../app/texts');
test('all app text references resolve in the editable dictionary and QR targets its profile link',()=>{
    for(const file of ['main.js','frame-login.js','index.html']){
        const source=fs.readFileSync('app/'+file,'utf8');
        const references=file.endsWith('.html')?[...source.matchAll(/data-(?:text|placeholder|label|title|alt|href)="([^"]+)"/g)]:[
            ...[...source.matchAll(/\bT\(([^,)]*)/g)].flatMap(match=>[...match[1].matchAll(/["']([^"']+)["']/g)]),
            ...source.matchAll(/\brow\('([^']+)'/g),
            ...[...(source.match(/var optionHelp=\{([^}]+)\}/)||['',''])[1].matchAll(/:'([^']+)'/g)]
        ];
        for(const match of references)assert.equal(typeof strings[match[1]],'string',file+': '+match[1]);
        if(file.endsWith('.html'))assert.deepEqual([...source.matchAll(/>([^<>]*\p{L}[^<>]*)</gu)],[],file+': visible text must use the dictionary');
    }
    assert.equal(text('channels.watch'),'Oglądaj');assert.throws(()=>text('missing.key'),/MISSING_TEXT/);
    assert(fs.readFileSync('app/assets/profile-qr.svg','utf8').includes('data-url="'+strings['profiles.url']+'"'));
});

test('own error codes have editable messages and unknown errors retain safe placeholders',()=>{
    const source=fs.readFileSync('app/main.js','utf8'),vm=require('node:vm');
    const notice={textContent:''},context={T:text,$:()=>notice,netiaNow:()=>0,clearTimeout(){},setTimeout(){}};
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('var messages ='),source.indexOf('    function rpc(')),context);
    vm.runInContext('var noticeTimer,lastRegisteredError;'+source.slice(source.indexOf('    function errorText(message){'),source.indexOf('    function notice(error) {'))+source.match(/    function notice\(error\) \{[^\n]+/)[0],context);
    for(const file of ['main.js','frame-login.js']){
        for(const [,code] of fs.readFileSync('app/'+file,'utf8').matchAll(/new Error\('([A-Z_0-9]+)'\)/g)){
            assert.equal(typeof context.messages[code],'string',file+': '+code);
            context.notice({message:code});assert.equal(notice.textContent.replace(/\n/g,' '),context.messages[code]);
        }
    }
    assert.equal(context.messages.LOGIN_TIMEOUT,text('errors.loginTimeout'));
    assert.equal(context.messages.COOKIE_CLEAR_FAILED,text('errors.cookieClear'));
    // Netia platform, licence and stream errors name where the fault is.
    const shown=code=>{context.notice({message:code});return notice.textContent.replace(/\n/g,' ');};
    context.notice({message:'DRM_UNRESPONSIVE'});assert.deepEqual(notice.textContent.split('\n'),['Moduł DRM telewizora (Widevine) przestał odpowiadać.','Zamknij aplikację i uruchom ją ponownie;','jeśli to nie pomoże, restartuj telewizor.'],'One sentence, and one clause after a semicolon, per line');
    assert.equal(shown('RPC_4021'),text('errors.netiaRpc',{code:'4021'}));
    assert.equal(shown('HTTP_503'),text('errors.netiaHttp',{status:'503'}));
    assert.equal(shown('INVALID_RESPONSE'),text('errors.netiaInvalid'));
    assert.equal(shown('PLAYER_1001_HTTP_404'),text('errors.streamHttp',{status:'404'}));
    assert.equal(shown('PLAYER_1002'),text('errors.streamNetwork'));
    assert.equal(shown('PLAYER_1003'),text('errors.streamTimeout'));
    assert.equal(shown('PLAYER_4001'),text('errors.streamManifest',{code:4001}));
    assert.equal(shown('PLAYER_3016'),text('errors.streamMedia',{code:3016}));
    assert.equal(shown('PLAYER_6007_RPC_13440'),context.messages.RPC_13440);
    assert.equal(shown('PLAYER_6007_NETWORK'),context.messages.NETWORK);
    assert.equal(shown('PLAYER_6007_RPC_999'),text('errors.netiaLicense',{code:'RPC_999'}));
    assert.equal(shown('PLAYER_6001'),text('errors.drm',{code:6001}));
    for(const code of ['DRM_UNRESPONSIVE','LICENSE_TIMEOUT','STREAM_TIMEOUT'])assert.equal(typeof context.messages[code],'string',code);
    context.notice({message:'UNKNOWN_123'});assert.equal(notice.textContent.replace(/\n/g,' '),text('errors.generic',{code:'UNKNOWN_123'}));
    context.notice({message:'private <response>'});assert.equal(notice.textContent.replace(/\n/g,' '),text('errors.generic',{code:'APP_ERROR'}));
    assert.equal(text('options.minutes',{minutes:60}),'60 min');
    assert.equal(text('channels.count',{visible:3,total:10}),'Lista 3 z 10\ndostępnych kanałów');
    assert.equal(text('errors.guide',{code:'EPG_ERROR'}),'Nie udało się pobrać programu. Kod: EPG_ERROR');
});
test('launcher PNG retains an alpha channel and a fully transparent outer corner',()=>{
    const png=fs.readFileSync('app/assets/icon.png');assert.equal(png[25],6);const chunks=[];
    for(let at=8;at<png.length;){const size=png.readUInt32BE(at),kind=png.toString('ascii',at+4,at+8);if(kind==='IDAT')chunks.push(png.subarray(at+8,at+8+size));assert(['IHDR','IDAT','IEND'].includes(kind));at+=size+12;}
    assert.equal(zlib.inflateSync(Buffer.concat(chunks))[4],0);
});
