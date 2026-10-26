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
    vm.runInContext('var noticeTimer,lastRegisteredError;'+source.match(/    function notice\(error\) \{[^\n]+/)[0],context);
    for(const file of ['main.js','frame-login.js']){
        for(const [,code] of fs.readFileSync('app/'+file,'utf8').matchAll(/new Error\('([A-Z_0-9]+)'\)/g)){
            assert.equal(typeof context.messages[code],'string',file+': '+code);
            context.notice({message:code});assert.equal(notice.textContent,context.messages[code]);
        }
    }
    assert.equal(context.messages.LOGIN_TIMEOUT,text('errors.loginTimeout'));
    assert.equal(context.messages.COOKIE_CLEAR_FAILED,text('errors.cookieClear'));
    context.notice({message:'UNKNOWN_123'});assert.equal(notice.textContent,text('errors.generic',{code:'UNKNOWN_123'}));
    context.notice({message:'private <response>'});assert.equal(notice.textContent,text('errors.generic',{code:'APP_ERROR'}));
    assert.equal(text('options.minutes',{minutes:60}),'60 min');
    assert.equal(text('channels.count',{visible:3,total:10}),'Lista 3 z 10\ndostępnych kanałów');
    assert.equal(text('errors.guide',{code:'EPG_ERROR'}),'Nie udało się pobrać programu. Kod: EPG_ERROR');
});
test('launcher PNG retains an alpha channel and a fully transparent outer corner',()=>{
    const png=fs.readFileSync('app/assets/icon.png');assert.equal(png[25],6);const chunks=[];
    for(let at=8;at<png.length;){const size=png.readUInt32BE(at),kind=png.toString('ascii',at+4,at+8);if(kind==='IDAT')chunks.push(png.subarray(at+8,at+8+size));assert(['IHDR','IDAT','IEND'].includes(kind));at+=size+12;}
    assert.equal(zlib.inflateSync(Buffer.concat(chunks))[4],0);
});
