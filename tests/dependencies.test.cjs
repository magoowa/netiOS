'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),fs=require('node:fs');
test('installed CLI honours security overrides and excludes upstream development packages',()=>{
    const cliRequire=createRequire(require.resolve('@webos-tools/cli/package.json'));
    const overrides=require('../package.json').overrides['@webos-tools/cli'];
    for(const name of ['body-parser','proxy-addr','qs'])assert.equal(cliRequire(name+'/package.json').version,overrides[name]);
    const installed=JSON.parse(fs.readFileSync('node_modules/.package-lock.json','utf8'));
    assert(Object.values(installed.packages).every(pkg=>!pkg.extraneous),'Install the project with npm 12.2.1 to avoid the provider development tree');
});
