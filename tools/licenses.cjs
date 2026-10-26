'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),metadata=require('../package.json'),lock=require('../package-lock.json'),rows=new Map();
const verifiedMIT=new Set(['ar-async@0.1.4','buildcheck@0.0.7','cpu-features@0.0.10','ssh2@1.17.0']);
for(const [location,pkg] of Object.entries(lock.packages)){
    if(!location||pkg.extraneous)continue;
    const name=location.split('node_modules/').pop();let license=pkg.license;
    if(!license){
        assert(verifiedMIT.has(name+'@'+pkg.version),'Verify the missing license before adding a package');
        const file=path.join(root,location,'LICENSE');
        if(fs.existsSync(file)){
            const text=fs.readFileSync(file,'utf8');
            assert(text.includes('Permission is hereby granted, free of charge')&&text.includes('MERCHANTABILITY'),'Installed license differs from the verified license');
        }
        license='MIT';
    }
    assert(typeof license==='string'&&license.length>0,'Missing package license');
    rows.set(name+'@'+pkg.version,{name,version:pkg.version,license});
}
const packages=[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const document=path.join(root,'docs','THIRD-PARTY.md');
const intro=fs.readFileSync(document,'utf8').split('## Zależności npm')[0].replace(/^# Technologie i licencje netiOS .*$/m,'# Technologie i licencje netiOS '+metadata.version);
fs.writeFileSync(document,intro+`## Zależności npm

Wykaz generuje polecenie \`npm run licenses\` z package-lock.json. Obejmuje ${packages.length} unikalnych par nazwa–wersja wymaganych zależności bez wpisów extraneous, także pakiety opcjonalne i pośrednie. Do IPK z npm trafia skompilowany Shaka Player z licencją; pozostałe pakiety służą narzędziom.

Różne wersje tego samego pakietu odpowiadają wymaganiom różnych bibliotek nadrzędnych. Nie wolno scalać niezgodnych głównych wersji samym wymuszeniem numeru. npm 12.2.1 pomija shrinkwrap dostawcy CLI i obsługuje poprawki bezpieczeństwa zapisane w overrides projektu.

Licencje pochodzą z metadanych lockfile. Brakujące wpisy ar-async, buildcheck, cpu-features i ssh2 zweryfikowano w ich plikach LICENSE (MIT). Pełne warunki i informacje autorów zachowują pierwszeństwo przed tą tabelą.

| Pakiet | Wersja | Licencja |
|---|---|---|
`+packages.map(pkg=>'| '+pkg.name+' | '+pkg.version+' | '+pkg.license+' |').join('\n')+'\n');
console.log('License inventory: '+packages.length+' package versions');
