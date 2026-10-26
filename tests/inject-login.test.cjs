'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {localAddress,discoveryLocation,inject}=require('../tools/inject-login.cjs');
test('injector discovery accepts only a matching local IPv4 description, without redirects',()=>{
    assert(localAddress('192.168.1.5'));assert(localAddress('172.31.2.4'));assert(!localAddress('172.32.2.4'));assert(!localAddress('8.8.8.8'));assert(!localAddress('127.0.0.1; command'));
    assert.equal(discoveryLocation('LOCATION: http://192.168.1.5:3000/description.xml\r\n','192.168.1.5'),'http://192.168.1.5:3000/description.xml');
    assert.equal(discoveryLocation('LOCATION: http://example.com/','192.168.1.5'),null);
});
test('injector passes credentials as CDP arguments, never as executable source, and reports a closed login screen',async()=>{
    const calls=[],socket={send(text){const m=JSON.parse(text);calls.push(m);queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:m.id,result:m.method==='Runtime.evaluate'?{result:{objectId:'synthetic-window'}}:{result:{value:true}}})}));}};
    const credentials={username:'synthetic-user',password:'synthetic-secret\";throw Error()'};await inject(socket,credentials);
    assert.equal(calls[1].params.arguments[0].value.password,credentials.password);assert(!calls[1].params.functionDeclaration.includes(credentials.password));assert(!calls[0].params.expression.includes(credentials.username));
    socket.send=function(text){const m=JSON.parse(text);queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:m.id,result:m.method==='Runtime.evaluate'?{result:{objectId:'synthetic-window'}}:{result:{value:false},exceptionDetails:{}}})}));};
    await assert.rejects(inject(socket,credentials),/LOGIN_SCREEN_REQUIRED/);
});
