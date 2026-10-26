'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync,spawnSync}=require('node:child_process');
test('license inventory covers omitted optional packages and rejects unverified versions',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'netios-licenses-'));
    try{
        fs.mkdirSync(path.join(directory,'tools'));fs.mkdirSync(path.join(directory,'docs'));
        fs.copyFileSync(path.resolve('tools/licenses.cjs'),path.join(directory,'tools/licenses.cjs'));
        fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({version:'test'}));
        fs.writeFileSync(path.join(directory,'docs/THIRD-PARTY.md'),'# Technologie i licencje netiOS test\n\n## Zależności npm\n');
        const lock={packages:{'':{},'node_modules/cpu-features':{version:'0.0.10',optional:true}}};
        fs.writeFileSync(path.join(directory,'package-lock.json'),JSON.stringify(lock));
        execFileSync(process.execPath,[path.join(directory,'tools/licenses.cjs')]);
        assert(fs.readFileSync(path.join(directory,'docs/THIRD-PARTY.md'),'utf8').includes('| cpu-features | 0.0.10 | MIT |'));
        lock.packages['node_modules/cpu-features'].version='999.0.0';
        fs.writeFileSync(path.join(directory,'package-lock.json'),JSON.stringify(lock));
        const result=spawnSync(process.execPath,[path.join(directory,'tools/licenses.cjs')],{encoding:'utf8'});
        assert.notEqual(result.status,0);assert.match(result.stderr,/Verify the missing license/);
    }finally{
        assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep+'netios-licenses-'));
        fs.rmSync(directory,{recursive:true,force:true});
    }
});
