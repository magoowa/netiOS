'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(pending=false,manual=false){
 const writes=[],submitted=[],fields={};
 class Storage{constructor(){this.values={}}getItem(k){return this.values[k]||null}setItem(k,v){writes.push(k);this.values[k]=String(v)}removeItem(k){delete this.values[k]}}
 class Input{get value(){return this.text||''}set value(v){this.text=v}dispatchEvent(){}addEventListener(){}}
 class Doc{createElement(){return {}}constructor(){this.head={appendChild(){}};this.jar={rodo:'declined'};this.readyState='complete'}get cookie(){return Object.entries(this.jar).map(([k,v])=>k+'='+v).join('; ')}set cookie(v){writes.push('cookie');const i=v.indexOf('=');if(/expires=Thu, 01 Jan 1970/i.test(v))delete this.jar[v.slice(0,i)];else this.jar[v.slice(0,i)]=v.slice(i+1)}querySelector(q){return q.includes('email')?fields.username:fields.password}querySelectorAll(){return buttons}}
 fields.username=new Input();fields.password=new Input();
 const doc=new Doc(),storage=new Storage(),w={document:doc,Storage,localStorage:storage,HTMLInputElement:Input,Event:class{},location:{origin:'about:blank'},next:{router:{isReady:true}},grecaptcha:{enterprise:{ready(callback){callback()}}}};
 const buttons=[{textContent:'Nie, przejdź do serwisu',visible:true,getBoundingClientRect(){return {height:this.visible?20:0}},click(){this.visible=false}},{textContent:'Zaloguj się',disabled:false,click(){submitted.push([fields.username.value,fields.password.value]);storage.setItem('credentials','must-not-persist');if(!pending){doc.cookie='user-session='+encodeURIComponent(JSON.stringify({id:'synthetic-session',key:'c3ludGhldGljLWtleQ==',keyExpirationTime:4102444800}));doc.cookie='user-recognition='+encodeURIComponent(JSON.stringify({clientId:'synthetic-client',deviceId:'synthetic-device'}))}}}];
 const frame={contentWindow:w,set src(v){this.url=v;w.location.origin=v.startsWith('https:')?'https://go.netia.pl':'about:blank'},get src(){return this.url}};
 let now=Date.UTC(2026,9,25);const intervals=new Set();
 const context={T:require('../app/texts'),Promise,Date,Error,SyntaxError,setInterval,clearInterval,setTimeout,clearTimeout,document:{getElementById:()=>frame},webOS:{deviceInfo(callback){callback({sdkVersion:'5.6.1'})}}};
 if(manual)Object.assign(context,{JSON,Date:{now:()=>now},setInterval(fn){intervals.add(fn);return fn;},clearInterval(fn){intervals.delete(fn);},setTimeout(){},clearTimeout(){}});
 context.window=context;vm.runInNewContext(fs.readFileSync('app/frame-login.js','utf8'),context);
 return {api:context.NetiaFrameLogin,frame,w,writes,submitted,buttons,context,tick(){now+=101;for(const fn of [...intervals])fn();}};
}
test('official iframe login rejects partner consent, fills once and uses the provider cookie store without a RAM cookie shim',async()=>{
 const f=fixture(),result=await f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});
 assert.equal(result.session.id,'synthetic-session');assert.equal(result.clientId,'synthetic-client');assert.equal(result.deviceId,'synthetic-device');assert.deepEqual(f.submitted,[['synthetic-user','synthetic-password']]);assert.equal(f.buttons[0].visible,false);assert(f.writes.includes('credentials'));assert.equal(f.w.localStorage.getItem('credentials'),null);assert(f.writes.includes('cookie'));assert.equal(f.w.webOS,f.context.webOS);assert.equal(f.frame.src,'about:blank');
});
test('cancelling iframe login rejects the pending attempt and unloads its document',async()=>{
 const f=fixture(true,true);f.buttons[0].visible=false;const promise=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});f.tick();assert.equal(f.w.document.querySelector('password').value,'synthetic-password');f.api.cancel();await assert.rejects(promise,/LOGIN_CANCELLED/);assert.equal(f.frame.src,'about:blank');assert.equal(f.submitted.length,0);
});
test('after sign out the official iframe prefills only the username and waits for LG keyboard input',async()=>{
 const f=fixture(true),pending=f.api.open({username:'synthetic-user',remember:false},()=>{},true);
 await new Promise(r=>setTimeout(r,250));
 assert.equal(f.w.document.querySelector('email').value,'synthetic-user');assert.equal(f.w.document.querySelector('password').value,'');assert.deepEqual(f.submitted,[]);
 f.api.cancel();await assert.rejects(pending,/LOGIN_CANCELLED/);
});
test('cancelling cookie cleanup unloads the frame and permits immediate interactive reopening',async()=>{
 const f=fixture(true),cleanup=f.api.forget();f.api.cancel();await assert.rejects(cleanup,/LOGIN_CANCELLED/);assert.equal(f.frame.src,'about:blank');
 const reopened=f.api.open(null,()=>{},true);await new Promise(r=>setTimeout(r,150));assert.equal(f.frame.src,'https://go.netia.pl/login');f.api.cancel();await assert.rejects(reopened,/LOGIN_CANCELLED/);
});
test('a TV that denies frame access fails clearly without disabling browser security',async()=>{
 const f=fixture();Object.defineProperty(f.w,'location',{get(){const e=new Error('blocked');e.name='SecurityError';throw e}});Object.defineProperty(f.frame,'src',{value:'about:blank',writable:true});await assert.rejects(f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{}),/FRAME_ACCESS_UNSUPPORTED/);
});

test('saved provider cookies restore without a password and sign-out clears authentication',async()=>{
 const f=fixture();f.w.document.jar['user-session']=encodeURIComponent(JSON.stringify({id:'synthetic-session',key:'c3ludGhldGljLWtleQ==',keyExpirationTime:4102444800}));f.w.document.jar['user-recognition']=encodeURIComponent(JSON.stringify({clientId:'synthetic-client',deviceId:'synthetic-device'}));const result=await f.api.open(null,()=>{});assert.equal(result.session.id,'synthetic-session');assert.deepEqual(f.submitted,[]);await f.api.forget();assert.equal(f.w.document.jar['user-session'],undefined);assert.equal(f.w.document.jar['user-recognition'],undefined);
});

test('official login rejection returns its code promptly and permits a new attempt',async()=>{
 const f=fixture();f.w.document.body={textContent:'Coś poszło nie tak. Podając kod: (13572:)'};
 await assert.rejects(f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{}),/RPC_13572/);
 assert.equal(f.frame.src,'about:blank');assert.deepEqual(f.submitted,[]);
 f.w.document.body.textContent='';const result=await f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});
 assert.equal(result.session.id,'synthetic-session');
});

test('cold LG device info completes before loading the official page; cancellation cannot navigate later',async()=>{
 const f=fixture();let ready;f.context.webOS.deviceInfo=callback=>{ready=callback};
 const result=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});
 await new Promise(r=>setTimeout(r,25));assert.notEqual(f.frame.src,'https://go.netia.pl/login');assert.deepEqual(f.submitted,[]);
 ready({sdkVersion:'5.6.1'});assert.equal((await result).session.id,'synthetic-session');
 const cancelled=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});f.api.cancel();await assert.rejects(cancelled,/LOGIN_CANCELLED/);
 ready({sdkVersion:'5.6.1'});assert.equal(f.frame.src,'about:blank');
});

test('missing LG system version fails without submitting incomplete device data',async()=>{
 const f=fixture();f.context.webOS.deviceInfo=callback=>callback({});
 await assert.rejects(f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{}),/DEVICE_INFO_UNAVAILABLE/);
 assert.deepEqual(f.submitted,[]);assert.equal(f.frame.src,'about:blank');
});
test('a newly navigated frame receives the LG SDK before its head exists and retries document preparation',async()=>{
 const f=fixture(true),head=f.w.document.head;f.w.document.head=null;const pending=f.api.open(null,()=>{},true);
 await new Promise(r=>setTimeout(r,30));const sdk=f.w.webOS;f.w.document.head=head;
 await new Promise(r=>setTimeout(r,25));f.api.cancel();await assert.rejects(pending,/LOGIN_CANCELLED/);assert.equal(sdk,f.context.webOS);
});

test('interactive official form remains open and captures entered credentials for encrypted remembering',async()=>{
 const f=fixture(true);const promise=f.api.open(null,()=>{},true);await new Promise(r=>setTimeout(r,30));
 assert.equal(f.frame.src,'https://go.netia.pl/login');assert.deepEqual(f.submitted,[]);
 f.w.document.querySelector('email').value='synthetic-user';f.w.document.querySelector('password').value='synthetic-password';
 await new Promise(r=>setTimeout(r,150));
 f.w.document.jar['user-session']=encodeURIComponent(JSON.stringify({id:'synthetic-session',key:'c3ludGhldGljLWtleQ==',keyExpirationTime:4102444800}));
 f.w.document.jar['user-recognition']=encodeURIComponent(JSON.stringify({clientId:'synthetic-client',deviceId:'synthetic-device'}));
 const result=await promise;assert.equal(result.credentials.username,'synthetic-user');assert.equal(result.credentials.password,'synthetic-password');
});

test('E0: document, router and enabled submit gate a single automatic form submission',async()=>{
 const f=fixture(false,true);f.buttons[0].visible=false;
 f.w.document.readyState='loading';f.w.next.router.isReady=false;f.buttons[1].disabled=true;
 const pending=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});
 f.tick();assert.equal(f.submitted.length,0);
 f.w.document.readyState='complete';f.tick();assert.equal(f.submitted.length,0);
 f.w.next.router.isReady=true;f.tick();assert.equal(f.submitted.length,0);assert.equal(f.w.document.querySelector('email').value,'synthetic-user');assert.equal(f.w.document.querySelector('password').value,'synthetic-password');
 f.buttons[1].disabled=false;f.tick();assert.equal(f.submitted.length,1);
 f.tick();await pending;assert.equal(f.submitted.length,1);
});

test('E0: expired cookies allow form login but malformed JSON ends the attempt before submission',async()=>{
 const f=fixture(false,true);f.buttons[0].visible=false;
 f.w.document.jar['user-session']=encodeURIComponent(JSON.stringify({id:'expired',keyExpirationTime:1}));
 const pending=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});
 f.tick();f.tick();f.tick();await pending;assert.equal(f.submitted.length,1);
 f.w.document.jar['user-session']=encodeURIComponent('{invalid-json');
 const malformed=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});
 f.tick();await assert.rejects(malformed,/INVALID_SESSION/);assert.equal(f.submitted.length,1);
});

function controllerFixture(api,rpc){
 const source=fs.readFileSync('app/main.js','utf8'),nodes={},events=[];
 const context={Promise,Error,Object,T:require('../app/texts'),clearTimeout(){},loginTimer:null,loginRevision:0,pendingLogin:null,
  NetiaFrameLogin:api,rpc,$:id=>nodes[id]||(nodes[id]={}),show:screen=>events.push(screen),loginStage(){},notice:error=>events.push(error.message),
  profiles:()=>rpc('profiles')};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('    function clearLogin()'),source.indexOf("    $('official-login-button').onclick")),context);
 vm.runInContext(source.slice(source.indexOf('    function start()'),source.lastIndexOf('    start();')),context);
 return {context,events};
}

test('a new app process discards warm service state and cookies before iframe login; retry stays bounded',async()=>{
 const calls=[],api={cancel(){},open:async()=>{calls.push('iframe');return {session:{}};},forget:async()=>{calls.push('forget');}};
 const f=controllerFixture(api,async method=>{
  calls.push(method);if(method==='lock')return true;
  if(method==='rememberedAccount')return null;
  if(method==='acceptFrameSession')throw new Error('RPC_13572');
  throw new Error('UNEXPECTED_CALL');
 });
 await f.context.start();
 assert.deepEqual(calls,['importedSession','lock','forget','rememberedAccount','iframe','acceptFrameSession','forget','importedSession','rememberedAccount','iframe','acceptFrameSession']);
 assert.equal(f.events.at(-1),'RPC_13572');
});

test('cold launch never hands off saved cookies and a rejected form is retried once by the user, not automatically',async()=>{
 const frame=fixture(false,true),handoffs=[],modes=[];
 frame.w.document.jar['user-session']=encodeURIComponent(JSON.stringify({id:'synthetic-rejected-session',key:'c3ludGhldGljLWtleQ==',keyExpirationTime:4102444800}));
 frame.w.document.jar['user-recognition']=encodeURIComponent(JSON.stringify({clientId:'synthetic-client',deviceId:'synthetic-device'}));
 const api={cancel:frame.api.cancel,forget(){const result=frame.api.forget();frame.tick();return result;},open(...args){modes.push(!!args[3]);const result=frame.api.open(...args);frame.tick();frame.tick();frame.tick();frame.tick();if(args[3]){assert.equal(frame.submitted.length,1);frame.buttons[1].click();frame.tick();}return result;}};
 const f=controllerFixture(api,async(method,data)=>{
  if(method==='lock')return true;
  if(method==='rememberedAccount')return {username:'synthetic-user',password:'synthetic-password',remember:true};
  if(method==='acceptFrameSession'){handoffs.push(data.session.id);throw new Error('RPC_13572');}
  throw new Error('UNEXPECTED_CALL');
 });
 await f.context.start();assert.deepEqual(handoffs,['synthetic-session','synthetic-session']);assert.deepEqual(modes,[false,true]);
 assert.equal(frame.submitted.length,2);assert.equal(f.events.at(-1),'RPC_13572');
});

test('prefill settles before submitting the official form',async()=>{
 const f=fixture(true,true);f.buttons[0].visible=false;let formStateReady=true;
 f.w.document.querySelector('password').dispatchEvent=()=>{formStateReady=false;Promise.resolve().then(()=>{formStateReady=true;});};
 const click=f.buttons[1].click;let clickedBeforeState=false;
 f.buttons[1].click=()=>{clickedBeforeState=!formStateReady;click();};
 const pending=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});
 f.tick();assert.equal(f.submitted.length,0);
 await Promise.resolve();assert.equal(formStateReady,true);f.tick();assert.equal(clickedBeforeState,false);assert.equal(f.submitted.length,1);
 f.api.cancel();await assert.rejects(pending,/LOGIN_CANCELLED/);
});

test('E1: profiles rejection after accepted iframe session is reported without clearing cookies',async()=>{
 const calls=[],api={cancel(){},forget:async()=>{calls.push('forget');},open:async()=>({session:{}})};
 const f=controllerFixture(api,async method=>{
  calls.push(method);if(method==='lock')return true;
  if(method==='rememberedAccount')return null;
  if(method==='acceptFrameSession')return true;
  if(method==='profiles')throw new Error('RPC_13572');
  throw new Error('UNEXPECTED_CALL');
 });
 await f.context.start();
 assert.deepEqual(calls,['importedSession','lock','forget','rememberedAccount','acceptFrameSession','profiles']);
 assert.equal(f.context.pendingLogin,null);assert.equal(f.events.at(-1),'RPC_13572');
 assert.equal(f.events.includes('RPC_13572'),true);
});

test('E1: cancelling rejected-session cleanup prevents a fresh automatic attempt',async()=>{
 let finishCleanup;let opened=0;
 const api={cancel(){},open:async()=>{opened++;return {session:{}};},forget:()=>new Promise(resolve=>{finishCleanup=resolve;})};
 const f=controllerFixture(api,async method=>{
  if(method==='status')return {loggedIn:false};if(method==='rememberedAccount')return null;
  throw new Error('RPC_13572');
 });
 const pending=f.context.officialLogin();while(!finishCleanup)await Promise.resolve();
 f.context.cancelLogin();finishCleanup();await pending;assert.equal(opened,1);assert.equal(f.events.at(-1),'login');
});

test('cancelling cold cookie cleanup cannot start a later automatic login',async()=>{
 let finishCleanup,opened=0;const calls=[];
 const f=controllerFixture({cancel(){},forget:()=>new Promise(r=>finishCleanup=r),open:async()=>{opened++;}},async method=>{calls.push(method);if(method==='lock')return true;throw Error('UNEXPECTED_CALL');});
 const pending=f.context.start();while(!finishCleanup)await Promise.resolve();f.context.cancelLogin();finishCleanup();await pending;
 assert.equal(opened,0);assert.deepEqual(calls,['importedSession','lock']);assert.equal(f.events.at(-1),'login');
});
test('visibility resume preserves an active service session without invoking cold login',async()=>{
 const source=fs.readFileSync('app/main.js','utf8'),calls=[];let handler;
 const context={document:{hidden:false,addEventListener:(name,fn)=>handler=fn},screen:'channels',rpc:async()=>({loggedIn:true}),syncClock:()=>calls.push('clock'),refreshPrograms:()=>calls.push('programs'),start:()=>calls.push('cold'),notice(){}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf("    document.addEventListener('visibilitychange'"),source.indexOf("    // Session keepalive every")),context);
 handler();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['clock','programs']);
});

test('automated submit waits for the page reCAPTCHA readiness instead of racing its lazy load',async()=>{
 const f=fixture(true,true);f.buttons[0].visible=false;let ready;f.w.grecaptcha={enterprise:{ready(callback){ready=callback}}};
 const pending=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{});
 for(let i=0;i<5;i++)f.tick();assert.deepEqual(f.submitted,[]);
 ready();f.tick();assert.deepEqual(f.submitted,[['synthetic-user','synthetic-password']]);
 f.api.cancel();await assert.rejects(pending,/LOGIN_CANCELLED/);
});
test('one automated submit per attempt; a reloaded form and a manual retry wait for the user',async()=>{
 const f=fixture(true,true);f.buttons[0].visible=false;const statuses=[];
 const pending=f.api.open({username:'synthetic-user',password:'synthetic-password'},s=>statuses.push(s));
 f.tick();f.tick();assert.equal(f.submitted.length,1);
 const reloaded=Object.create(Object.getPrototypeOf(f.w.document));Object.assign(reloaded,f.w.document,{jar:{}});f.w.document=reloaded;
 for(let i=0;i<5;i++)f.tick();assert.equal(f.submitted.length,1);assert.equal(f.w.document.querySelector('password').value,'synthetic-password');
 assert(statuses.includes(f.context.T('login.manualSubmit')));
 f.api.cancel();await assert.rejects(pending,/LOGIN_CANCELLED/);
 const manual=f.api.open({username:'synthetic-user',password:'synthetic-password'},()=>{},true,true);
 for(let i=0;i<5;i++)f.tick();assert.equal(f.submitted.length,1);f.api.cancel();await assert.rejects(manual,/LOGIN_CANCELLED/);
});
test('a visible reCAPTCHA challenge stops automation and asks the user to verify',async()=>{
 const f=fixture(true,true);f.buttons[0].visible=false;const statuses=[];
 const widget={src:'https://www.recaptcha.net/recaptcha/enterprise/anchor?k=synthetic&size=normal',getBoundingClientRect(){return {width:304,height:78}}};
 const badge={src:'https://www.recaptcha.net/recaptcha/enterprise/anchor?k=synthetic&size=invisible',getBoundingClientRect(){return {width:256,height:60}}};
 const all=f.w.document.querySelectorAll.bind(f.w.document);f.w.document.querySelectorAll=q=>q==='iframe'?[badge,widget]:all(q);
 const pending=f.api.open({username:'synthetic-user',password:'synthetic-password'},s=>statuses.push(s));
 for(let i=0;i<5;i++)f.tick();assert.deepEqual(f.submitted,[]);assert(statuses.includes(f.context.T('login.challenge')));
 f.api.cancel();await assert.rejects(pending,/LOGIN_CANCELLED/);
});

test('a session imported from a computer browser replaces cookie cleanup and the iframe (webOS 4 cannot run the official form)',async()=>{
 const calls=[],sent=[],imported={session:{id:'s',key:'k',keyExpirationTime:9e9},clientId:'c',deviceId:'d'};
 const api={cancel(){},forget:async()=>{calls.push('forget');},open:async()=>{calls.push('iframe');}};
 const f=controllerFixture(api,async(method,params)=>{
  calls.push(method);if(method==='importedSession')return imported;
  if(method==='rememberedAccount')return null;
  if(method==='acceptFrameSession'){sent.push(params);return true;}
  if(method==='profiles')return [];
  throw new Error('UNEXPECTED_CALL');
 });
 await f.context.start();
 assert.deepEqual(calls,['importedSession','rememberedAccount','acceptFrameSession','profiles']);
 assert.deepEqual([sent[0].session,sent[0].clientId,sent[0].deviceId],[imported.session,'c','d']);
});

test('a rejected imported session is discarded and the login screen shows, without falling back to the iframe',async()=>{
 const calls=[],imported={session:{id:'s',key:'k',keyExpirationTime:9e9},clientId:'c',deviceId:'d'};
 const api={cancel(){},forget:async()=>{calls.push('forget');},open:async()=>{calls.push('iframe');}};
 const f=controllerFixture(api,async method=>{
  calls.push(method);if(method==='importedSession')return imported;
  if(method==='rememberedAccount')return null;
  if(method==='acceptFrameSession')throw new Error('INVALID_SESSION');
  if(method==='discardImportedSession')return true;
  throw new Error('UNEXPECTED_CALL');
 });
 await f.context.start();
 assert.deepEqual(calls,['importedSession','rememberedAccount','acceptFrameSession','discardImportedSession']);
 assert.equal(f.events.at(-1),'INVALID_SESSION');assert.equal(f.events.includes('login'),true);
});
