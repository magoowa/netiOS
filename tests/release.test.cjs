'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const release=require('../tools/release.cjs');
test('release exports public sources only and rejects secrets, image metadata and private filenames',()=>{
    const files=release.sources();assert(files.includes('app/main.js'));assert(!files.some(f=>f.startsWith('.local/')||f==='user-config.json'||f==='test_login.txt'));
    assert.deepEqual(files.filter(f=>f.startsWith('docs/')&&!f.startsWith('docs/screenshots/')).sort(),['docs/INSTALL.md','docs/PUBLICATION.md','docs/TESTING.md','docs/THIRD-PARTY.md','docs/USER_CONFIGURATION.md'],'Only user-facing documents are published; the working journal stays private');
    assert.throws(()=>release.inspect(Buffer.from('synthetic-password'),'app/main.js',['synthetic-password']),/RELEASE_PRIVATE_VALUE/);
    for(const address of ['10.23.45.67','172.16.23.45','192.168.23.45'])assert.throws(()=>release.inspect(Buffer.from(address),'docs/example.md',[]),/RELEASE_PRIVATE_ADDRESS/);
    release.inspect(Buffer.from('Example TV: 192.0.2.5; local server: 127.0.0.1'),'docs/example.md',[]);
    assert.throws(()=>release.inspect(Buffer.alloc(0),'.local/capture.har',[]),/RELEASE_PRIVATE_FILE/);
    assert.throws(()=>release.inspect(Buffer.from('<svg><metadata>editor</metadata></svg>'),'app/logo.svg',[]),/RELEASE_SVG_METADATA/);
    const png=fs.readFileSync('app/assets/icon.png');release.pngClean(png);
    const metadata=Buffer.alloc(12);metadata.write('tEXt',4);assert.throws(()=>release.pngClean(Buffer.concat([png,metadata])),/RELEASE_IMAGE_METADATA/);
});
