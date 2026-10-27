'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const topFiles=['.gitignore','.gitattributes','README.md','CHANGELOG.md','SECURITY.md','CONTRIBUTING.md','package.json','package-lock.json'];
const directories=['app','service','tools','tests','config','docs','.github'];
// docs/ also holds the private working journal (diagnoses, acceptance notes, plans, docs/en originals); only these
// user-facing documents and the demonstration screenshots are published.
const publicDocs=/^docs\/(?:USER_CONFIGURATION|THIRD-PARTY|TESTING|PUBLICATION|INSTALL)\.md$|^docs\/screenshots\/[a-z-]+\.png$/;
function sources(directory=root){
    const files=[];
    function walk(relative){for(const item of fs.readdirSync(path.join(directory,relative),{withFileTypes:true})){
        if(item.isSymbolicLink())throw Error('RELEASE_SYMLINK');
        const file=path.posix.join(relative,item.name);
        if(item.isDirectory())walk(file);
        else if(file.startsWith('docs/')&&!publicDocs.test(file))continue;
        else if(/\.(?:js|cjs|json|css|html|svg|png|woff2|py|md|ya?ml|sh|ps1|cmd|command)$/.test(item.name)||/^(?:MDI|JOSEFIN|WEBOSTV)-LICENSE$/.test(item.name))files.push(file);
        else throw Error('RELEASE_UNKNOWN_FILE');
    }}
    for(const name of directories)walk(name);
    return topFiles.concat(files);
}
function pngClean(bytes){
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    let at=8;
    while(at<bytes.length){const size=bytes.readUInt32BE(at),type=bytes.subarray(at+4,at+8).toString();assert(['IHDR','IDAT','IEND'].includes(type),'RELEASE_IMAGE_METADATA');at+=size+12;}
    assert.equal(at,bytes.length);
}
function inspect(bytes,name,needles){
    for(const needle of needles)assert(!bytes.includes(Buffer.from(needle)),'RELEASE_PRIVATE_VALUE');
    if(name.endsWith('.md'))assert(!/\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/.test(bytes.toString()),'RELEASE_PRIVATE_ADDRESS');
    assert(!/(?:^|\/)(?:\.local|node_modules|test_login\.txt|user-config\.json)(?:\/|$)|\.(?:xapk|apk|har|pem|key)$/.test(name),'RELEASE_PRIVATE_FILE');
    if(name.endsWith('.png'))pngClean(bytes);
    if(name.endsWith('.svg'))assert(!/<(?:metadata|sodipodi:)|inkscape:|file:\/\/|<script|onload=/i.test(bytes.toString()),'RELEASE_SVG_METADATA');
}
function inspectPackage(bytes,needles){
    assert.equal(bytes.subarray(0,8).toString(),'!<arch>\n');let count=0;
    for(let at=8;at<bytes.length;){
        const header=bytes.subarray(at,at+60).toString(),size=Number(header.slice(48,58)),name=header.slice(0,16).trim();
        assert(Number.isSafeInteger(size)&&size>0&&at+60+size<=bytes.length,'RELEASE_ARCHIVE');
        const data=bytes.subarray(at+60,at+60+size);at+=60+size+(size%2);if(!name.includes('.tar.gz'))continue;
        const tar=zlib.gunzipSync(data);
        for(let i=0;i+512<=tar.length;){
            const head=tar.subarray(i,i+512);if(!head.some(x=>x))break;
            const file=head.subarray(0,100).toString().replace(/\0.*$/,''),n=parseInt(head.subarray(124,136).toString().replace(/\0.*$/,'').trim()||'0',8);
            assert(Number.isSafeInteger(n)&&n>=0&&i+512+n<=tar.length,'RELEASE_TAR');
            inspect(tar.subarray(i+512,i+512+n),file,needles);inspect(head,file+'.header',needles);count++;i+=512+Math.ceil(n/512)*512;
        }
    }
    assert(count>0);return count;
}
function release(){
    const version=require('../package.json').version,dist=path.join(root,'dist'),output=path.join(dist,'release'),checkout=path.join(dist,'github','netiOS');
    const needles=[root,root.replace(/\\/g,'/'),os.userInfo().username].filter(s=>s.length>=4);
    const privateInput=['test_login.txt','.local/private/test_login.txt'].map(f=>path.join(root,f)).find(f=>fs.existsSync(f));
    if(privateInput)for(const match of fs.readFileSync(privateInput,'utf8').matchAll(/^\s*(?:login|username|hasło|haslo|password)\s*[:=]\s*(.+)$/gim))if(match[1].trim().length>=4)needles.push(match[1].trim());
    const extra=path.join(root,'.local/release-private.json');if(fs.existsSync(extra)){const values=JSON.parse(fs.readFileSync(extra));assert(Array.isArray(values)&&values.every(v=>typeof v==='string'&&v.length>=4));needles.push(...values);}
    const files=sources();for(const file of files)inspect(fs.readFileSync(path.join(root,file)),file,needles);
    const ipk='com.netiago.webos_'+version+'_all.ipk',bytes=fs.readFileSync(path.join(dist,ipk));
    const entries=inspectPackage(bytes,needles),hash=crypto.createHash('sha256').update(bytes).digest('hex');
    const manifest=JSON.parse(fs.readFileSync(path.join(dist,'com.netiago.webos.manifest.json')));
    assert.equal(manifest.version,version);assert.equal(manifest.ipkHash.sha256,hash);assert.equal(manifest.ipkUrl,ipk);
    // An export that already is a published repository (it has .git) is updated in place: its files are replaced and the
    // release becomes one more commit on its history, so the push fast-forwards. Otherwise a fresh repository is created.
    const published=fs.existsSync(path.join(checkout,'.git'));
    for(const target of published?[output]:[output,checkout]){
        assert(target.startsWith(dist+path.sep));
        if(fs.existsSync(target)){
            const archive=path.join(root,'.local','archive','release-'+Date.now()+'-'+path.basename(target));fs.mkdirSync(path.dirname(archive),{recursive:true});fs.renameSync(target,archive);
        }
        fs.mkdirSync(target,{recursive:true});
    }
    if(published)for(const item of fs.readdirSync(checkout))if(item!=='.git')fs.rmSync(path.join(checkout,item),{recursive:true,force:true});
    for(const name of [ipk,'com.netiago.webos.manifest.json','icon.png','SHA256SUMS'])fs.copyFileSync(path.join(dist,name),path.join(output,name));
    for(const file of files){const to=path.join(checkout,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
    // Homebrew Channel repository served from the published repository (raw files allow cross-origin reads); the IPK is a
    // release asset. NETIOS_REPO names the GitHub repository (OWNER/NAME).
    const repository=process.env.NETIOS_REPO||'magoowa/netiOS';assert(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository),'RELEASE_REPOSITORY');
    const raw='https://raw.githubusercontent.com/'+repository+'/main/homebrew/',homebrew=path.join(checkout,'homebrew');fs.mkdirSync(homebrew);
    const hosted=Object.assign({},manifest,{ipkUrl:'https://github.com/'+repository+'/releases/download/v'+version+'/'+ipk,iconUri:raw+'icon.png'});
    fs.writeFileSync(path.join(homebrew,'com.netiago.webos.manifest.json'),JSON.stringify(hosted,null,2)+'\n');fs.copyFileSync(path.join(dist,'icon.png'),path.join(homebrew,'icon.png'));
    const listing=JSON.stringify({paging:{page:1,count:1,maxPage:1,itemsTotal:1},packages:[{id:manifest.id,title:manifest.title,iconUri:raw+'icon.png',manifestUrl:raw+'com.netiago.webos.manifest.json',manifest:hosted,category:'multimedia',pool:'main',shortDescription:'Nieoficjalny klient Netia GO dla LG webOS'}]},null,2)+'\n';
    // repo.json is the same listing under the name repository tools commonly look for; apps.json stays for existing users.
    for(const name of ['apps.json','repo.json'])fs.writeFileSync(path.join(homebrew,name),listing);
    if(!published)execFileSync('git',['init','-b','main'],{cwd:checkout,stdio:'pipe'});
    execFileSync('git',['add','--all'],{cwd:checkout,stdio:'pipe'});
    for(const file of files.filter(f=>/\.(?:sh|command)$/.test(f)))execFileSync('git',['update-index','--chmod=+x',file],{cwd:checkout,stdio:'pipe'});
    // The export is authored by a neutral identity unless NETIOS_RELEASE_AUTHOR=git asks for the maintainer's own git identity.
    const own=process.env.NETIOS_RELEASE_AUTHOR==='git',config=key=>execFileSync('git',['config',key],{cwd:root,encoding:'utf8'}).trim();
    const name=own?config('user.name'):'netiOS Project',email=own?config('user.email'):'project@users.noreply.github.com';
    execFileSync('git',['-c','user.name='+name,'-c','user.email='+email,'-c','commit.gpgsign=false','commit','-m','netiOS '+version],{cwd:checkout,stdio:'pipe'});
    execFileSync('git',['tag','-f','v'+version],{cwd:checkout,stdio:'pipe'});
    const archive=path.join(output,'netiOS-'+version+'-source.zip');execFileSync('git',['-c','core.autocrlf=false','archive','--format=zip','--output',archive,'HEAD'],{cwd:checkout,stdio:'pipe'});
    const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');fs.appendFileSync(path.join(output,'SHA256SUMS'),sourceHash+'  '+path.basename(archive)+'\n');
    // Installer bundle: the scripts of tools/installer with this IPK beside them, so they install it without downloading.
    const installer=path.join(output,'netiOS-'+version+'-installer.zip');
    execFileSync('git',['-c','core.autocrlf=false','archive','--format=zip','--prefix=netiOS-'+version+'/','--add-file='+path.join(output,ipk),'--output',installer,'HEAD:tools/installer'],{cwd:checkout,stdio:'pipe'});
    const installerHash=crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');fs.appendFileSync(path.join(output,'SHA256SUMS'),installerHash+'  '+path.basename(installer)+'\n');
    console.log('RELEASE_PASS version='+version+' sources='+files.length+' packageEntries='+entries+' sha256='+hash);
}
if(require.main===module)release();else module.exports={sources,pngClean,inspect,inspectPackage};
