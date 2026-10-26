'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync('.local/tv-inspector.json', 'utf8'));
assert.match(config.endpoint, /^ws:\/\/(127\.0\.0\.1|localhost):\d+\//);
const socket = new WebSocket(config.endpoint);
let seq = 0;
const pending = new Map();
function call(method, params) {
    return new Promise((resolve, reject) => {
        const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('TV_INSPECTOR_TIMEOUT')); }, 25000);
        pending.set(id, data => { clearTimeout(timer); if (data.error) reject(new Error('TV_INSPECTOR_ERROR')); else resolve(data.result); });
        socket.send(JSON.stringify({id, method, params}));
    });
}
socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); } });
(async () => {
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', () => reject(new Error('TV_INSPECTOR_CONNECTION')), {once: true}); });
    const target = await call('Runtime.evaluate', {expression: 'location.pathname', returnByValue: true});
    assert.equal(target.result.value.endsWith('/com.netiago.webos/index.html'), true, 'WRONG_TV_APP');
    const expression = 'new Promise(function(resolve){var v=document.getElementById("video"),start=Date.now(),initial=v.currentTime,t=setInterval(function(){var n=document.getElementById("notice").textContent,p=document.getElementById("player-message").textContent,code=(n+" "+p).match(/\\b(6007|6008|[1-9][0-9]{3})\\b/);if(code||n||p.indexOf("Błąd")>=0||Date.now()-start>15000||(v.readyState>=3&&!v.paused&&v.currentTime>initial+1)){clearInterval(t);resolve({readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,playing:!v.paused&&v.currentTime>initial+1,error:code?code[1]:(n?"APP_ERROR":null)})}},250)})';
    const reply = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    const result = reply.result.value;
    console.log(JSON.stringify(result));
    assert.equal(result.error, null, 'TV_PLAYBACK_FAILED');
    assert.equal(result.playing && result.width > 0 && result.readyState >= 3, true, 'TV_VIDEO_NOT_ADVANCING');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => socket.close());
