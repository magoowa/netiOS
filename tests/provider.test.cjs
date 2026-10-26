'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {Provider, token} = require('../service/provider');
const session = {id: 'synthetic-session', key: Buffer.alloc(32, 7).toString('base64'), keyExpirationTime: 4102444800};
const auth = {session, accessGroups: ['package:basic'], profileId: 'synthetic-profile'};
test('request signing binds namespace and method, retaining URL-safe Base64 padding', () => {
    const text = 'synthetic-session|4102444800|auth|getProfiles';
    const expected = crypto.createHmac('sha256', Buffer.alloc(32, 7)).update(text).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
    assert.equal(token(session, 'auth', 'getProfiles'), text + '|' + expected);
    assert.notEqual(token(session, 'auth', 'getSession'), token(session, 'auth', 'getProfiles'));
});
test('authoritative product access overrides both false-positive and missing grant expressions', async () => {
    const a = {id: 'a', title: 'Denied channel', published: true, mediaType: 'tv', grantExpression: 'package:basic', product: {id: 'product-a', type: 'media', subType: 'tv'}};
    const b = {id: 'b', title: 'Included channel', published: true, mediaType: 'tv', grantExpression: 'package:other', product: {id: 'product-b', type: 'media', subType: 'tv'}};
    const p = new Provider(async (ns, req) => ({result: req.method === 'getTvChannels' ? {total: 2, results: [a, b]} : [{product: a.product, access: {status: -1}}, {product: b.product, access: {status: 0}}]}));
    p.importSession(auth); assert.deepEqual((await p.list()).map(c => c.id), ['b']);
});
test('catalogue consumes all pages, excludes paid channels and sorts names', async () => {
    const calls = [];
    const p = new Provider(async (ns, req) => {
        if (req.method === 'checkProductsAccess') return {result: req.params.products.map(product => ({product, access: {status: product.id === '3' ? -1 : 0}}))};
        calls.push(req.params.offset);
        const channel = (id, title, grant = 'package:basic') => ({id, title, grantExpression: grant, published: true, mediaType: 'tv', product: {id, type: 'media', subType: 'tv'}});
        return {result: req.params.offset === 0 ? {total: 4, results: [channel('2', 'Kanał 10'), channel('3', 'Paid', 'package:extra')]} : {total: 4, results: [channel('1', 'Kanał 2'), channel('4', 'Alfa')]}};
    });
    p.importSession(auth);
    assert.deepEqual((await p.list()).map(c => c.title), ['Alfa', 'Kanał 2', 'Kanał 10']);
    assert.deepEqual(calls, [0, 2]);
    await assert.rejects(p.play('3'), /NOT_ENTITLED/);
});

test('channel metadata preserves real LCN and original catalogue order without inventing LCN',async()=>{
    const items=[{id:'z',title:'Zeta',lcn:80},{id:'a',title:'Alfa',lcn:-1}].map(c=>({...c,published:true,mediaType:'tv',product:{id:c.id,type:'media',subType:'tv'}}));
    const p=new Provider(async(ns,req)=>({result:req.method==='getTvChannels'?{total:2,results:items}:items.map(c=>({product:c.product,access:{status:0}}))}));p.importSession(auth);
    const result=await p.list();assert.deepEqual(result.map(c=>[c.id,c.lcn,c.sourceOrder]),[['a',null,1],['z',80,0]]);
});

test('more than 100 entitled channels survive pagination and unordered access batches', async () => {
    const items = Array.from({length: 137}, (_, i) => ({id: 'c' + i, title: 'Channel ' + i, published: true, mediaType: 'tv', product: {id: 'p' + i, type: 'media', subType: 'tv'}}));
    const sizes = [];
    const p = new Provider(async (ns, req) => {
        if (req.method === 'getTvChannels') return {result: {total: items.length, results: items.slice(req.params.offset, req.params.offset + 100)}};
        sizes.push(req.params.products.length);
        return {result: req.params.products.slice().reverse().map(product => ({product, access: {status: 0}}))};
    }); p.importSession(auth);
    const listed = await p.list(); assert.equal(listed.length, 137); assert.equal(listed[136].title, 'Channel 136'); assert.deepEqual(sizes, [40, 40, 40, 17]);
});

test('a pending product-access response cannot cross a profile boundary', async () => {
    let release;
    const c = {id: 'c', title: 'Synthetic', published: true, mediaType: 'tv', product: {id: 'p', type: 'media', subType: 'tv'}};
    const p = new Provider((ns, req) => req.method === 'getTvChannels' ? Promise.resolve({result: {total: 1, results: [c]}}) : new Promise(resolve => { release = resolve; }));
    p.importSession(auth); const pending = p.list(); await new Promise(resolve => setImmediate(resolve)); p.clear(); release({result: [{product: c.product, access: {status: 0}}]});
    await assert.rejects(pending, /STALE_REQUEST/); assert.equal(p.channels.length, 0);
});
test('old catalogue response cannot cross an account/profile boundary', async () => {
    let release;
    const p = new Provider(() => new Promise(resolve => { release = resolve; })); p.importSession(auth);
    const pending = p.list(); p.clear(); release({result: {total: 0, results: []}});
    await assert.rejects(pending, /STALE_REQUEST/); assert.equal(p.channels.length, 0);
});
test('empty nonterminal pages cannot loop forever', async () => {
    const p = new Provider(async () => ({result: {total: 5, results: []}})); p.importSession(auth);
    await assert.rejects(p.list(), /INVALID_PAGINATION/);
});

test('EPG batches every entitled channel and strips private reporting fields', async () => {
    const batches = [];
    const p = new Provider(async (ns, req) => {
        batches.push(req.params.channelIds);
        return {result: Object.fromEntries(req.params.channelIds.map(id => [id, [{id: 'show', title: 'Synthetic programme', description: 'Description', startTime: '2026-10-23T08:00:00Z', endTime: '2026-10-23T09:00:00Z', reporting: {authToken: 'synthetic-reporting-token'}}]]))};
    });
    p.importSession(auth); p.channels = Array.from({length: 27}, (_, i) => ({id: 'c' + i, title: 'Channel ' + i}));
    const items = await p.programs(undefined, '2026-10-23');
    assert.deepEqual(batches.map(b => b.length), [12, 12, 3]); assert.equal(items.length, 27);
    assert.equal(items[0].description, 'Description'); assert.equal(JSON.stringify(items).includes('reporting'), false);
    await assert.rejects(p.programs('paid', '2026-10-23'), /NOT_ENTITLED/);
    await assert.rejects(p.programs(undefined, '2026-02-30'), /INVALID_DATE/);
    await assert.rejects(p.programs(undefined, '../private'), /INVALID_DATE/);
});

test('channel logos select dark transparent provider art and reject other hosts', async () => {
    const c = {id: 'c', title: 'Synthetic channel', published: true, mediaType: 'tv', product: {id: 'c', type: 'media', subType: 'tv'}, gallery: [{aspect: {width: 16, height: 9}, customParams: {appTheme: 'dark', backgroundEffect: 'transparent'}, src: 'http://ipla.pluscdn.pl/logo.png'}]};
    const p = new Provider(async (ns, req) => ({result: req.method === 'checkProductsAccess' ? [{product: c.product, access: {status: 0}}] : {total: 1, results: [c]}})); p.importSession(auth);
    assert.equal((await p.list())[0].logo, 'https://ipla.pluscdn.pl/logo.png');
    c.gallery[0].src = 'https://example.invalid/logo.png'; assert.equal((await p.list())[0].logo, null);
});
test('provider reports required verification without changing client identity', async () => {
    const p = new Provider(async () => ({error: {code: 13458, data: {type: 'CaptchaRequiredException'}}}));
    await assert.rejects(p.login('synthetic-user', 'synthetic-password'), /CAPTCHA_REQUIRED/);
    assert.equal(p.auth, null);
});

test('login forwards only a bounded supported CAPTCHA response and preserves normal identity', async () => {
    let observed, calls = 0;
    const p = new Provider(async (ns, req) => { assert.equal(ns, 'auth/2.0'); calls++; observed = req; return {result: auth}; });
    const identity = p.identity.deviceId.value;
    await p.login('synthetic-user', 'synthetic-password', {type: 'recaptcha_enterprise_v2_challenge_checkbox', value: 'synthetic-captcha-token', ignored: 'discard'});
    assert.deepEqual(observed.params.captcha, {type: 'recaptcha_enterprise_v2_challenge_checkbox', value: 'synthetic-captcha-token'});
    assert.equal(p.identity.deviceId.value, identity); assert.equal(JSON.stringify(p.auth).includes('synthetic-captcha-token'), false);
    for (const captcha of [null, {type: 'other', value: 'token'}, {type: 'recaptcha_enterprise_v3', value: ''}, {type: 'recaptcha_enterprise_v3', value: 'x'.repeat(16385)}]) await assert.rejects(p.login('synthetic-user', 'synthetic-password', captcha), /INVALID_CAPTCHA/);
    assert.equal(calls, 1);
});

test('CAPTCHA required, low-score and incorrect-answer responses remain distinct', async () => {
    for (const [code, expected] of [[13458, 'CAPTCHA_REQUIRED'], [13461, 'CAPTCHA_LOW_SCORE'], [13452, 'CAPTCHA_INVALID']]) {
        const p = new Provider(async () => ({error: {code}}));
        await assert.rejects(p.login('synthetic-user', 'synthetic-password'), new RegExp(expected)); assert.equal(p.auth, null);
    }
});
test('invalid or expired imported sessions are rejected', () => {
    const p = new Provider(); assert.throws(() => p.importSession({}), /INVALID_SESSION/);
    assert.throws(() => p.importSession({...auth, session: {...session, keyExpirationTime: 1}}), /INVALID_SESSION/);
});

test('iframe session handoff verifies getSession and trusts only the server auth fields', async () => {
    let calls = 0;
    const p = new Provider(async (namespace, req) => {
        calls++; assert.equal(namespace, 'auth'); assert.equal(req.method, 'getSession');
        assert.equal(req.params.clientId, 'synthetic-client'); assert.equal(req.params.deviceId.value, 'synthetic-device');
        assert.equal(req.params.authData.sessionToken, token(session, 'auth', 'getSession'));
        return {result: {...auth, user: {id: 'synthetic-user-id', email: 'discard@example.invalid'}}};
    });
    await p.acceptFrameSession({session, clientId: 'synthetic-client', deviceId: 'synthetic-device', accessGroups: ['forged-group']});
    assert.deepEqual(p.auth.accessGroups, auth.accessGroups); assert.equal(p.auth.user, undefined);
    assert.equal(p.auth.accountKey, crypto.createHash('sha256').update('synthetic-user-id').digest('hex'));
    p.importSession(auth); assert.equal(p.auth.accountKey, crypto.createHash('sha256').update('synthetic-user-id').digest('hex'));
    await assert.rejects(p.acceptFrameSession({session, clientId: '', deviceId: 'synthetic-device'}), /INVALID_SESSION/); assert.equal(calls, 1);
});

test('rejected or cancelled iframe session verification cannot restore authentication', async () => {
    const rejected = new Provider(async () => ({error: {code: 13404}}));
    await assert.rejects(rejected.acceptFrameSession({session, clientId: 'synthetic-client', deviceId: 'synthetic-device'}), /RPC_13404/); assert.equal(rejected.auth, null);
    let release; const p = new Provider(() => new Promise(resolve => { release = resolve; }));
    const pending = p.acceptFrameSession({session, clientId: 'synthetic-client', deviceId: 'synthetic-device'}); p.clear(); release({result: auth});
    await assert.rejects(pending, /STALE_REQUEST/); assert.equal(p.auth, null);
});

test('near-expiry requests share one renewal without clearing the active player', async () => {
    const calls = [];
    const p = new Provider(async (ns, req) => {
        calls.push(req.method);
        return {result: req.method === 'getSession' ? auth : []};
    });
    p.importSession({...auth, session: {...session, keyExpirationTime: Math.floor(Date.now() / 1000) + 30}});
    p.playing = {mediaId: 'synthetic-channel'};
    await Promise.all([p.profiles(), p.profiles()]);
    assert.equal(calls.filter(m => m === 'getSession').length, 1);
    assert.equal(p.playing.mediaId, 'synthetic-channel');
    assert.equal(p.auth.session.keyExpirationTime, session.keyExpirationTime);
});

test('a pending session renewal cannot restore a signed-out account', async () => {
    let release;
    const p = new Provider(() => new Promise(resolve => { release = resolve; }));
    p.importSession({...auth, session: {...session, keyExpirationTime: Math.floor(Date.now() / 1000) + 30}});
    const pending = p.profiles(); p.clear(); release({result: auth});
    await assert.rejects(pending, /STALE_REQUEST/);
    assert.equal(p.auth, null);
});
test('license challenge uses only the current authorized source and preserves provider policy', async () => {
    let observed;
    const p = new Provider(async (ns, req) => { observed = {ns, req}; return {result: {object: {license: 'c3ludGhldGlj', message_type: 'LICENSE'}}}; }); p.importSession(auth);
    await assert.rejects(p.license('c3ludGhldGlj'), /INVALID_CHALLENGE/);
    p.playing = {cpid: 0, mediaId: 'synthetic-channel', sourceId: 'synthetic-source', keyId: 'synthetic-key'};
    assert.equal(await p.license('ab+/=='), 'c3ludGhldGlj');
    assert.equal(observed.ns, 'drm'); assert.equal(observed.req.method, 'getWidevineLicense');
    assert.equal(observed.req.params.object, 'ab-_=='); assert.equal(observed.req.params.mediaId, 'synthetic-channel');
    p.transport = async () => ({result: {object: {license: 'c3ludGhldGlj'}, accessPolicy: {cac: {required: true}}}});
    await assert.rejects(p.license('c3ludGhldGlj'), /UNSUPPORTED_ACCESS_POLICY/);
});
test('playback advertises measured DRM, upgrades the approved CDN and chooses a granted source', async () => {
    let request;
    const p = new Provider(async (ns, req) => {
        request = req;
        return {result: {mediaItem: {playback: {mediaSources: [
            {id: 'low', quality: '384p', accessMethod: 'dash', granted: true, authorizationServices: {widevine: {}}, url: 'http://cdn.example.pluscdn.pl/test.mpd'},
            {id: 'high', quality: '1080p', accessMethod: 'dash', granted: true, authorizationServices: {widevine: {}}, url: 'http://cdn.example.pluscdn.pl/test.mpd'},
            {id: 'untrusted', quality: '2160p', accessMethod: 'dash', granted: true, authorizationServices: {widevine: {}}, url: 'http://localhost/private'}
        ]}}}};
    }); p.importSession(auth); p.channels = [{id: 'synthetic-channel', cpid: 0, title: 'Synthetic channel'}];
    await assert.rejects(p.play('synthetic-channel'), /WIDEVINE_REQUIRED/);
    const result = await p.play('synthetic-channel', {widevine: true, userAgent: 'Synthetic webOS browser'});
    assert.equal(result.url, 'https://cdn.example.pluscdn.pl/test.mpd'); assert.equal(p.playing.sourceId, 'high');
    assert.equal(request.params.userAgentData.widevine, true); assert.equal(request.params.userAgentData.os, 'webos');
});
test('backend clock sample uses the response timestamp and a monotonic anchor',async()=>{
 const remote=Date.UTC(2026,0,1,12,34,56),p=new Provider(async()=>({result:{},serverTimestamp:remote}));
 await p.rpc('system','getConfiguration',{},true);assert.equal(p.clockSample.epoch,remote);assert.equal(p.clockSample.at.length,2);
 const missing=new Provider(async()=>({result:{}}));await missing.rpc('system','getConfiguration',{},true);assert.equal(missing.clockSample,undefined);
});

test('inclusive VOD discovers roots, filters categories, verifies episodes and advances raw page offsets',async()=>{
 const product=id=>({id,type:'media',subType:'vod'}),calls=[];
 const p=new Provider(async(ns,q)=>{calls.push(q);if(q.method==='getHomeMenu')return {result:[{name:'Seriale',place:{type:'category',value:'123'}}]};
 if(q.method==='getCategoryContent')return {result:{limit:100,total:250,results:q.params.catid===123?[{id:10,name:'Included',grantExpression:'package:basic'},{id:11,name:'Denied',grantExpression:'package:extra'},{id:12,name:'Unknown expression',grantExpression:'package:basic|vip:true'}]:[{id:'one',title:'Included episode',mediaType:'vod',published:true,product:product('one'),cpid:1},{id:'two',title:'Paid episode',mediaType:'vod',published:true,product:product('two'),cpid:1}]}};
 if(q.method==='checkProductsAccess')return {result:q.params.products.map(x=>({product:x,access:{status:x.id==='one'?0:-1}}))};throw Error('Unexpected call');});
 p.importSession(auth);assert.deepEqual(await p.catalog('series',undefined,0),{items:[{id:'10',title:'Included',description:'',image:null,category:true,parentId:'123',backdrop:null,season:null,episodeNumber:null}],next:100});
 assert.deepEqual((await p.catalog('series','10',0)).items.map(x=>x.id),['one']);assert(p.vodMedia.one);assert.equal(p.vodMedia.two,undefined);
 await assert.rejects(p.catalog('series','11',0),/INVALID_CATEGORY/);await assert.rejects(p.catalog('series','10',-1),/INVALID_CATALOG/);await assert.rejects(p.catalog('unknown',undefined,0),/INVALID_CATALOG/);
 p.clear();assert.equal(p.vodMedia,null);await assert.rejects(p.catalog('series','10',0),/PROFILE_REQUIRED/);
});
test('VOD response cannot populate a different account or profile',async()=>{
 let done;const p=new Provider(async(ns,q)=>q.method==='getHomeMenu'?{result:[{name:'Programy',place:{type:'category',value:'2'}}]}:new Promise(r=>{done=r}));p.importSession(auth);const pending=p.catalog('shows',undefined,0);while(!done)await new Promise(r=>setImmediate(r));p.clear();done({result:{results:[],total:0,limit:100}});await assert.rejects(pending,/STALE_REQUEST/);assert.equal(p.vodCategories,null);
});
test('missing category artwork uses the latest published included episode across pages and nested seasons',async()=>{
 const image='https://thumbs.pluscdn.pl/latest.jpg',p=new Provider();p.importSession(auth);p.vodCategories={root:true};const calls=[];
 p.catalog=async(kind,id,offset)=>{calls.push([id,offset]);if(id==='root')return offset===0?{items:[{id:'old',image:'https://thumbs.pluscdn.pl/old.jpg',publishedAt:100},{id:'season',category:true}],next:100}:{items:[{id:'new',image,publishedAt:300}],next:null};return {items:[{id:'root',category:true},{id:'middle',image:'https://thumbs.pluscdn.pl/middle.jpg',publishedAt:200},{id:'undated',image:'https://thumbs.pluscdn.pl/unknown.jpg',publishedAt:null},{id:'future',image:'https://thumbs.pluscdn.pl/future.jpg',publishedAt:Date.now()+86400000}],next:null};};
 assert.equal(await p.catalogArtwork('series','root'),image);assert.deepEqual(calls,[['root',0],['root',100],['season',0]]);await assert.rejects(p.catalogArtwork('series','unknown'),/INVALID_CATEGORY/);
 let done;p.catalogScans=null;p.catalog=()=>new Promise(r=>{done=r});const pending=p.catalogArtwork('series','root');while(!done)await new Promise(r=>setImmediate(r));p.clear();done({items:[],next:null});await assert.rejects(pending,/STALE_REQUEST/);
});
test('artwork publication dates are parsed from provider media and a newer paid episode cannot supply the fallback',async()=>{
 const image='https://thumbs.pluscdn.pl/included.jpg',p=new Provider(async(ns,q)=>{
  if(q.method==='getCategoryContent')return {result:{limit:100,total:2,results:['included','paid'].map((id,i)=>({id,title:id,mediaType:'vod',published:true,publicationDate:i?'2026-10-24T12:00:00Z':'2026-10-23T12:00:00Z',product:{id,type:'media',subType:'vod'},thumbnails:[{size:{width:500},src:i?'https://thumbs.pluscdn.pl/paid.jpg':image}]}))}};
  if(q.method==='checkProductsAccess')return {result:q.params.products.map(product=>({product,access:{status:product.id==='included'?0:-1}}))};throw Error('UNEXPECTED_CALL');
 });p.importSession(auth);p.vodCategories={'7':true};assert.equal(await p.catalogArtwork('shows','7'),image);assert.equal(p.vodMedia.paid,undefined);
});

test('VOD playback accepts only the exact official redirector, retaining granted Widevine requirements',async()=>{
 let host='redirector.redefine.pl',granted=true;
 const p=new Provider(async()=>({result:{mediaItem:{playback:{mediaSources:[{id:'source',keyId:'key',quality:'1080p',granted,accessMethod:'dash',authorizationServices:{widevine:{}},url:'http://'+host+'/vod/manifest.mpd'}]}}}}));
 p.importSession(auth);p.vodMedia={episode:{id:'episode',cpid:1,title:'Synthetic VOD'}};
 assert.equal((await p.play('episode',{widevine:true,userAgent:'Synthetic TV'},'vod')).url,'https://redirector.redefine.pl/vod/manifest.mpd');
 assert.equal(p.playbackDiagnostic,null);
 host='redirector.redefine.pl.evil.invalid';await assert.rejects(p.play('episode',{widevine:true,userAgent:'Synthetic TV'},'vod'),/UNSUPPORTED_STREAM/);
 assert.deepEqual(p.playbackDiagnostic,[{method:'dash',granted:true,widevine:true,playready:false,format:'other',pseudo:false,pseudoVersion:null,addressApproved:false}]);
 assert(!JSON.stringify(p.playbackDiagnostic).includes(host));
 host='redirector.redefine.pl';granted=false;await assert.rejects(p.play('episode',{widevine:true,userAgent:'Synthetic TV'},'vod'),/UNSUPPORTED_STREAM/);
 assert.equal(p.playbackDiagnostic[0].granted,false);assert.equal(p.playbackDiagnostic[0].addressApproved,true);p.clear();assert.equal(p.playbackDiagnostic,null);
});

test('clear MP4 VOD chooses the highest granted approved source without a DRM session',async()=>{
 const sources=[{id:'low',quality:'360p',url:'https://cdn.example.pluscdn.pl/low.mp4'},{id:'high',quality:'720p',url:'https://cdn.example.pluscdn.pl/high.mp4'},{id:'untrusted',quality:'2160p',url:'https://example.invalid/private'}].map(s=>({...s,granted:true,accessMethod:'direct',fileFormat:'mp4',authorizationServices:{},drmTypes:[]}));
 const p=new Provider(async()=>({result:{mediaItem:{playback:{mediaSources:sources}}}}));p.importSession(auth);p.vodMedia={episode:{id:'episode',cpid:1,title:'Synthetic VOD'}};
 const data=await p.play('episode',{widevine:true,userAgent:'Synthetic TV'},'vod');assert.equal(data.url,sources[1].url);assert.equal(data.mimeType,'video/mp4');assert.equal(data.drm,null);assert.equal(p.playing,null);
});

test('pseudo v2 VOD uses the signed official license method and validates its result',async()=>{
 const calls=[];let url='https://redirector.redefine.pl/vod/file.mp4';
 const p=new Provider(async(ns,request)=>{calls.push({ns,request});return {result:request.method==='prePlayData'?{mediaItem:{playback:{mediaSources:[{id:'high',quality:'720p',granted:true,accessMethod:'direct',fileFormat:'mp4',authorizationServices:{pseudo:{version:2}},drmTypes:['pseudo']}]}}}:{url}}});
 p.importSession(auth);p.vodMedia={episode:{id:'episode',cpid:1,title:'Synthetic VOD'}};const caps={widevine:true,userAgent:'Synthetic TV'};
 assert.equal((await p.play('episode',caps,'vod')).url,url);assert.equal(calls[1].ns,'drm');assert.equal(calls[1].request.method,'getPseudoLicense');assert.equal(calls[1].request.params.sourceId,'high');assert.equal(typeof calls[1].request.params.authData.sessionToken,'string');
 url='http://localhost/private';await assert.rejects(p.play('episode',caps,'vod'),/UNSUPPORTED_STREAM/);
});

test('direct fallback never removes another DRM requirement or ignores a denial',async()=>{
 for(const patch of [{granted:false},{authorizationServices:{widevine:{}}},{drmTypes:['widevine']},{authorizationServices:{pseudo:{version:1}}},{fileFormat:'wmv'},{accessMethod:'ss-tv'}]){
  const source={id:'source',quality:'720p',granted:true,accessMethod:'direct',fileFormat:'mp4',url:'https://cdn.example.pluscdn.pl/file.mp4',authorizationServices:{},drmTypes:[],...patch};
  const p=new Provider(async()=>({result:{mediaItem:{playback:{mediaSources:[source]}}}}));p.importSession(auth);p.vodMedia={episode:{id:'episode',cpid:1,title:'Synthetic VOD'}};
  await assert.rejects(p.play('episode',{widevine:true,userAgent:'Synthetic TV'},'vod'),/UNSUPPORTED_STREAM/);
 }
});

test('catalogue pages preserve parents without guessing season/episode metadata',async()=>{
 for(const kind of ['series','shows']){
  const pages=[],product=id=>({id,type:'media',subType:'vod'});
  const p=new Provider(async(ns,q)=>{
   if(q.method==='getHomeMenu')return {result:[{name:kind==='series'?'Seriale':'Programy',place:{type:'category',value:'1'}}]};
   if(q.method==='checkProductsAccess')return {result:q.params.products.map(product=>({product,access:{status:0}}))};
   assert.equal(q.method,'getCategoryContent');const {catid,offset}=q.params;pages.push([catid,offset]);
   // Synthetic probe fields below are not evidence of the live Netia schema.
   const category=(id,name,seasonNumber)=>({object:{id,name,seasonNumber,description:'Category description',grantExpression:'package:basic'}});
   const results=catid===1?[category(10,'Synthetic title')]:catid===10?[offset===0?category(102,'Season 2',2):category(110,'Season 10',10)]:[
    {object:{id:'episode-'+catid,title:'Episode',mediaType:'vod',published:true,product:product('episode-'+catid),seasonNumber:catid===102?2:10,episodeNumber:3,parentId:catid,description:'Episode description',publicationDate:'2026-10-23T12:00:00Z'}}];
   return {result:{results,total:catid===10?200:1,limit:100}};
  });
  p.importSession(auth);const root=await p.catalog(kind,undefined,0);assert.equal(root.items[0].id,'10');
  const second=await p.catalog(kind,'10',0),tenth=await p.catalog(kind,'10',second.next);
  assert.equal(second.next,100);assert.equal(tenth.next,null);
  assert.deepEqual([...second.items,...tenth.items].map(x=>x.id),['102','110']);
  for(const season of [...second.items,...tenth.items]){
   assert.equal(season.description,'Category description');assert.equal(season.seasonNumber,undefined);assert.equal(season.parentId,'10');
   const {items:[episode]}=await p.catalog(kind,season.id,0);
   assert.equal(episode.description,'Episode description');assert.equal(episode.publishedAt,Date.parse('2026-10-23T12:00:00Z'));
   assert.equal(episode.seasonNumber,undefined);assert.equal(episode.episodeNumber,3);assert.equal(episode.parentId,season.id);
   assert.equal(p.vodCategories[season.id].id,season.id);assert.equal(p.vodMedia[episode.id].parentId,Number(season.id));
  }
  assert.deepEqual(pages,[[1,0],[10,0],[10,100],[102,0],[110,0]]);
 }
});

test('catalogue details share the artwork traversal, preserve paths and use only the latest eligible episode for missing fields',async()=>{
 const p=new Provider();p.importSession(auth);p.vodCategories={'1':{title:'Title',description:'Own description',image:null}};
 let calls=0;
 p.catalog=async(kind,id,offset)=>{calls++;return id==='1'?{items:offset===0?[{id:'2',title:'Subcategory',category:true}]:[{id:'old',image:'https://thumbs.pluscdn.pl/old.jpg',description:'Old',publishedAt:100}],next:offset===0?100:null}:{items:[
  {id:'new',parentId:'2',description:'New',image:null,publishedAt:200},
  {id:'future',description:'Future',publishedAt:Date.now()+86400000},
  {id:'undated',description:'Unknown',publishedAt:null},
  {id:'1',category:true}],next:null};};
 const [details,image]=await Promise.all([p.catalogDetails('series','1'),p.catalogArtwork('series','1')]);
 assert.equal(calls,3);assert.equal(details.description,'Own description');assert.equal(details.latestEpisodeId,'new');assert.equal(details.image,null);
 assert.equal(image,'https://thumbs.pluscdn.pl/old.jpg');assert.equal(details.backdrop,null);assert.equal(details.metadataLimited,true);
 assert.deepEqual(details.items.map(x=>x.id),['old','new','undated']);assert.deepEqual(details.items[1].categoryPath,[{id:'2',title:'Subcategory'}]);
 p.vodCategories['1'].description='';assert.equal((await p.catalogDetails('series','1')).description,'New');assert.equal(calls,3);
 await p.catalogDetails('series','1',true);assert.equal(calls,6);
 p.clear();await assert.rejects(p.catalogDetails('series','1'),/INVALID_CATEGORY/);
});

test('catalogue details reject changed profiles, failed scans can retry and pagination cannot stall',async()=>{
 const p=new Provider();p.importSession(auth);p.vodCategories={'1':true};let release;
 p.catalog=()=>new Promise(resolve=>{release=resolve;});const pending=p.catalogDetails('shows','1');await Promise.resolve();p.clear();release({items:[],next:null});
 await assert.rejects(pending,/STALE_REQUEST/);
 p.importSession(auth);p.vodCategories={'1':true};p.catalog=async()=>({items:[],next:0});await assert.rejects(p.catalogDetails('shows','1'),/INVALID_PAGINATION/);
 p.catalog=async()=>({items:[],next:null});const empty=await p.catalogDetails('shows','1');assert.equal(empty.latestEpisodeId,null);assert.equal(empty.description,'');assert.equal(empty.image,null);
});

test('E0: thumbnail normalization is not a dedicated backdrop resolver',async()=>{
 const p=new Provider(async()=>({result:{limit:100,total:1,results:[{id:10,name:'Synthetic title',grantExpression:'package:basic',description:'Description',
  thumbnails:[{size:{width:1920},src:'https://thumbs.pluscdn.pl/backdrop.jpg'},{size:{width:500},src:'https://thumbs.pluscdn.pl/thumbnail.jpg'}]}]}}));
 p.importSession(auth);p.vodCategories={'1':true};
 const {items:[item]}=await p.catalog('series','1',0);
 assert.equal(item.image,'https://thumbs.pluscdn.pl/thumbnail.jpg');assert.equal(item.description,'Description');
 assert.equal(item.backdrop,null);
});

test('E0: artwork fallback chooses the newest dated episode with an image, not the newest episode description',async()=>{
 const product=id=>({id,type:'media',subType:'vod'}),p=new Provider(async(ns,q)=>{
  if(q.method==='checkProductsAccess')return {result:q.params.products.map(product=>({product,access:{status:0}}))};
  return {result:{limit:100,total:2,results:[
   {id:'older',title:'Older',mediaType:'vod',published:true,product:product('older'),publicationDate:'2026-10-22T12:00:00Z',description:'Older description',thumbnails:[{size:{width:500},src:'https://thumbs.pluscdn.pl/older.jpg'}]},
   {id:'newer',title:'Newer',mediaType:'vod',published:true,product:product('newer'),publicationDate:'2026-10-23T12:00:00Z',description:'Newest description'}]}};
 });
 p.importSession(auth);p.vodCategories={'1':true};
 assert.equal(await p.catalogArtwork('series','1'),'https://thumbs.pluscdn.pl/older.jpg');
 assert.equal(p.vodMedia.newer.description,'Newest description');
});

test('TV-observed episode metadata maps category season, episode number, paths and dedicated background safely',async()=>{
 const product={id:'episode',type:'media',subType:'vod'};
 const p=new Provider(async(ns,q)=>q.method==='checkProductsAccess'?{result:[{product,access:{status:0}}]}:{result:{total:1,limit:100,results:[{id:'episode',title:'Episode',mediaType:'vod',published:true,product,episodeNumber:10,ageGroup:12,accessibilityFeatures:['N','AD'],
 category:{id:22,seasonNumber:2,categoryPath:[1,11,22]},thumbnails:[{size:{width:768,height:432},src:'https://ipla.pluscdn.pl/thumbnail.jpg'}],gallery:[{aspect:{width:16,height:9},customParams:{appTheme:'dark',display:'background'},src:'https://ipla.pluscdn.pl/background.jpg'}]}]}});
 p.importSession(auth);p.vodCategories={'11':true};let item=(await p.catalog('series','11',0)).items[0];
 assert.deepEqual(item.season,{id:'22',number:2});assert.equal(item.episodeNumber,10);assert.equal(item.parentId,'22');assert.deepEqual(item.categoryPath,[{id:'1'},{id:'11'},{id:'22'}]);assert.equal(item.backdrop,'https://ipla.pluscdn.pl/background.jpg');
 assert.equal(item.ageGroup,12);assert.equal(item.closedCaptions,true);
 assert.deepEqual(item.imageSize,{width:768,height:432});
});

test('details preserve parent metadata, fall back only to the latest episode and suppress only identical single-episode text',async()=>{
 const p=new Provider();p.importSession(auth);p.vodCategories={'1':{title:'Same title',description:'Same description',genres:['Dokument'],ageGroup:0,closedCaptions:false}};
 let episodes=[{id:'one',title:'Same title',description:'Same description',publishedAt:100,ageGroup:12,closedCaptions:true,genres:['Rozrywka']}];
 p.catalog=async()=>({items:episodes,next:null});
 let details=await p.catalogDetails('shows','1');assert.equal(details.hideDescription,true);assert.equal(details.ageGroup,0);assert.equal(details.closedCaptions,false);assert.deepEqual(details.genres,['Dokument']);
 episodes[0].description='Different description';details=await p.catalogDetails('shows','1',true);assert.equal(details.hideDescription,false);
 episodes[0].description='Same description';episodes[0].title='Different title';assert.equal((await p.catalogDetails('shows','1',true)).hideDescription,false);
 episodes.push({...episodes[0],id:'two'});assert.equal((await p.catalogDetails('shows','1',true)).hideDescription,false);
 p.vodCategories['1']={title:'Same title',description:''};episodes=[{id:'one',title:'Same title',description:'Episode fallback',publishedAt:100,ageGroup:12,closedCaptions:true,genres:['Rozrywka']}];
 details=await p.catalogDetails('shows','1',true);assert.equal(details.hideDescription,false);assert.equal(details.description,'Episode fallback');assert.equal(details.ageGroup,12);assert.equal(details.closedCaptions,true);assert.deepEqual(details.genres,['Rozrywka']);
 episodes.push({id:'two',publishedAt:200,closedCaptions:false});assert.equal((await p.catalogDetails('shows','1',true)).closedCaptions,true);
 episodes[0].closedCaptions=false;assert.equal((await p.catalogDetails('shows','1',true)).closedCaptions,false);
});
test('a category known only from the app saved list opens in a fresh session; the root catalogue is paged once for concurrent requests',async()=>{
 const product=id=>({id,type:'media',subType:'vod'}),pages=[];
 const p=new Provider(async(ns,q)=>{if(q.method==='getHomeMenu')return {result:[{name:'Seriale',place:{type:'category',value:'123'}}]};
  if(q.method==='getCategoryContent'){pages.push([q.params.catid,q.params.offset]);return {result:{limit:100,total:q.params.catid===123?150:1,results:q.params.catid===123?(q.params.offset?[{id:77,name:'Synthetic saved series',grantExpression:'package:basic'}]:[{id:10,name:'Included',grantExpression:'package:basic'}]):[{id:'episode',title:'Synthetic episode',mediaType:'vod',published:true,product:product('episode'),publicationDate:'2026-10-01T12:00:00Z',thumbnails:[{src:'https://thumbs.pluscdn.pl/episode.jpg',size:{width:640,height:360}}]}]}};}
  if(q.method==='checkProductsAccess')return {result:q.params.products.map(x=>({product:x,access:{status:0}}))};throw Error('Unexpected call');});
 p.importSession(auth);
 const [details,artwork]=await Promise.all([p.catalogDetails('series','77'),p.catalogArtwork('series','77')]);
 assert.equal(details.title,'Synthetic saved series');assert.deepEqual(details.items.map(x=>x.id),['episode']);assert.equal(artwork,'https://thumbs.pluscdn.pl/episode.jpg','Missing artwork falls back to the newest episode again');
 assert.deepEqual(pages.filter(x=>x[0]===123),[[123,0],[123,100]],'The root catalogue is paged once for both requests');
 await assert.rejects(p.catalogDetails('series','999'),/INVALID_CATEGORY/);assert.equal(pages.filter(x=>x[0]===123).length,2,'Unknown ids do not page the root again');
 await assert.rejects(p.catalogDetails('series',{}),/INVALID_CATEGORY/);
 p.clear();assert.equal(p.rootCatalogs,null);
});
test('guide and playback requests that arrive before the channel list wait for it instead of failing NOT_ENTITLED',async()=>{
 const p=new Provider();p.importSession(auth);let loads=0,release;
 p.list=function(){loads++;const pending=new Promise(resolve=>{release=()=>{p.channels=[{id:'synthetic-c1'}];resolve([]);};});p.channelLoad=pending;pending.then(()=>{p.channelLoad=null;});return pending;};
 const known=p.knownChannel('synthetic-c1'),other=p.knownChannel('synthetic-missing');assert.equal(loads,1,'One load serves concurrent requests');release();
 assert.deepEqual(await known,{id:'synthetic-c1'});assert.equal(await other,null);
 await assert.rejects(p.play('synthetic-missing',{widevine:true,userAgent:'x'}),/NOT_ENTITLED/);assert.equal(loads,1,'A loaded list is not fetched again');
 p.channels=[];p.list=async()=>{loads++;p.channels=[{id:'synthetic-c1'}];return [];};await assert.rejects(p.programs('synthetic-missing'),/NOT_ENTITLED/);assert.equal(loads,2,'An empty session loads the list once before deciding');
});
