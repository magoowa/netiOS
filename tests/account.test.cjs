const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),account=require('../service/account');
test('remembered credentials are encrypted; sign out retains only the username and profile',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'netia-account-'));
 try{
  const a=account(dir),credentials={username:'synthetic-user',password:'synthetic-password',remember:true,profile:{id:'synthetic-profile',name:'Synthetic private profile'}};
  assert.equal(await a.load(),null);await a.save(credentials);assert.deepEqual(await account(dir).load(),credentials);
  const recordFile=path.join(dir,'account.vault'),bytes=fs.readFileSync(recordFile,'utf8');
  for(const value of [credentials.username,credentials.password,credentials.profile.name,credentials.profile.id])assert(!bytes.includes(value));
  await a.signOut();const signedOut=await account(dir).load();assert.deepEqual(signedOut,{username:credentials.username,profile:credentials.profile,remember:false});
  const decrypted=await require('../service/vault').open(JSON.parse(fs.readFileSync(recordFile,'utf8')),fs.readFileSync(path.join(dir,'account.key'),'utf8'));
  assert.equal(Object.hasOwn(decrypted,'password'),false);
  await a.save({...credentials,remember:false});assert.equal(Object.hasOwn(await a.load(),'password'),false);
  await a.forget();assert.equal(await a.load(),null);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('legacy encrypted credentials survive upgrade and tampering is rejected',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'netia-account-'));
 try{const a=account(dir);await a.save({username:'synthetic',password:'synthetic-password'});assert.equal((await a.load()).password,'synthetic-password');
 const file=path.join(dir,'account.vault'),record=JSON.parse(fs.readFileSync(file,'utf8'));record.tag=Buffer.alloc(16).toString('base64');fs.writeFileSync(file,JSON.stringify(record));await assert.rejects(a.load(),/VAULT_UNLOCK/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
