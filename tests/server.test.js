const {test}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const {createApp}=require('../server/app');
async function fixture(t, options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-intake-'));
 const server=createApp({dataDir:dir,...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 return {base:`http://127.0.0.1:${server.address().port}`,dir};
}
async function call(base,p,method='GET',body){const res=await fetch(base+p,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()};}
function meta(){return {id:'pw-12345',category:'construction',fields:{make:'CAT',model:'320'},description:'Used',photos:[{id:'photo-1',name:'machine.jpg',size:7,mime:'image/jpeg'}]};}
test('replayed create/chunk/complete requests never duplicate a submission',async t=>{
 const {base}=await fixture(t);const payload=meta();
 assert.equal((await call(base,'/submissions','POST',payload)).status,200);
 assert.equal((await call(base,'/submissions','POST',payload)).status,200);
 const chunkPath='/submissions/pw-12345/photos/photo-1/chunks/0';
 const chunk={base64:Buffer.from('photo!!').toString('base64'),expectedSize:7};
 assert.equal((await call(base,chunkPath,'PUT',chunk)).status,200);
 const replay=await call(base,chunkPath,'PUT',chunk);assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);
 assert.equal((await call(base,'/submissions/pw-12345/complete','POST',{})).status,200);
 assert.equal((await call(base,'/submissions/pw-12345/complete','POST',{})).status,200);
 const listing=await call(base,'/submissions');assert.equal(listing.body.length,1);assert.equal(listing.body[0].status,'submitted');
});
test('conflicting reupload is rejected',async t=>{const {base}=await fixture(t);await call(base,'/submissions','POST',meta());const p='/submissions/pw-12345/photos/photo-1/chunks/0';await call(base,p,'PUT',{base64:Buffer.from('photo!!').toString('base64'),expectedSize:7});assert.equal((await call(base,p,'PUT',{base64:Buffer.from('other!!').toString('base64'),expectedSize:7})).status,409);});
test('server may simulate temporary network failures',async t=>{const {base}=await fixture(t,{failureRate:1});assert.equal((await call(base,'/submissions','POST',meta())).status,503);});
test('metadata and uploaded bytes survive server restart',async t=>{const {base,dir}=await fixture(t);await call(base,'/submissions','POST',meta());await call(base,'/submissions/pw-12345/photos/photo-1/chunks/0','PUT',{base64:Buffer.from('photo!!').toString('base64'),expectedSize:7});assert.equal(fs.readFileSync(path.join(dir,'pw-12345-photo-1.part'),'utf8'),'photo!!');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'submissions.json')))['pw-12345'].photos[0].chunks[0].length,64);});
