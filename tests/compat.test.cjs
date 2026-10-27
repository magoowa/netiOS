'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),url=require('node:url'),util=require('node:util');

test('Node 0.12 compatibility layer fills Object.assign, Array#find, Buffer.from, util.promisify and the URL subset the provider uses',async()=>{
    const oldUrl={parse:url.parse,format:url.format},oldUtil={},ObjectShim={defineProperty:Object.defineProperty,prototype:Object.prototype};
    const ArrayShim=function(){};ArrayShim.prototype={slice:Array.prototype.slice};
    function BufferShim(value,encoding){return Buffer.from(value,encoding);}
    BufferShim.from=Uint8Array.from;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service/compat.js'),'utf8'),{require:name=>name==='url'?oldUrl:oldUtil,Object:ObjectShim,Array:ArrayShim,Buffer:BufferShim,Uint8Array,Promise,TypeError,String,process:{version:'v22.0.0'},exports:{}});
    assert.deepEqual(ObjectShim.assign({a:1},null,{b:2}),{a:1,b:2});
    assert.equal(ArrayShim.prototype.find.call([1,4,6],x=>x>3),4);
    assert.equal(BufferShim.from('aGk=','base64').toString(),'hi');
    assert.equal(await oldUtil.promisify((x,done)=>done(null,x+1))(1),2);
    await assert.rejects(oldUtil.promisify(done=>done(Error('X')))(),/X/);
    const u=new oldUrl.URL('http://user:pw@a.pluscdn.pl:8080/p/q.mpd?x=1#h');
    assert.deepEqual([u.protocol,u.hostname,u.port,u.username,u.password],['http:','a.pluscdn.pl','8080','user','pw']);
    const plain=new oldUrl.URL('http://a.pluscdn.pl/p/q.mpd?x=1');plain.protocol='https:';
    assert.equal(plain.toString(),new URL('https://a.pluscdn.pl/p/q.mpd?x=1').toString());
    assert.throws(()=>new oldUrl.URL('not a url'),TypeError);
});

test('without Intl (webOS 4 Node) channel names sort like the Polish collator: Polish letters after their base, numbers numeric', () => {
    const context = {require, Object, Array, Buffer, Uint8Array, Promise, TypeError, String, Number, Math, process: {version: 'v22.0.0'}, exports: {}};
    vm.runInNewContext('var Intl = undefined;' + fs.readFileSync(path.join(__dirname, '../service/compat.js'), 'utf8'), context);
    const names = ['TVN 24', 'Łowcy', 'tvp 2', 'Ale Kino+', 'TVP 10', 'Lowcy B', 'Ąbc', 'TVP 1', 'Żabka', 'Źródło', 'Zoom', 'Canal+ 4K', 'Ćma', 'Polsat 2', 'polsat'];
    const collator = new Intl.Collator('pl', {sensitivity: 'base', numeric: true}).compare;
    assert.notEqual(context.exports.compare, collator);
    assert.deepEqual(names.slice().sort(context.exports.compare), names.slice().sort(collator));
    assert.equal(context.exports.compare('POLSAT', 'polsat'), 0);
});
