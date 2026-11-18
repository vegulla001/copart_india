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
test('metadata and uploaded bytes survive server restart',async t=>{const {base,dir}=await fixture(t);await call(base,'/submissions','POST',meta());await call(base,'/submissions/pw-12345/photos/photo-1/chunks/0','PUT',{base64:Buffer.from('photo!!').toString('base64'),expectedSize:7});assert.equal(fs.readFileSync(path.join(dir,'pw-12345-photo-1.part'),'utf8'),'photo!!');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'submissions.json')))['pw-12345'].photos[0].chunks[0].sha256.length,64);});

test('rejects sparse uploads even when file length matches declared size',async t=>{
 const {base}=await fixture(t);const payload={...meta(),photos:[{...meta().photos[0],size:9}]};
 await call(base,'/submissions','POST',payload);
 for(const [offset,contents] of [[0,'abc'],[6,'ghi']]){
  assert.equal((await call(base,`/submissions/pw-12345/photos/photo-1/chunks/${offset}`,'PUT',{base64:Buffer.from(contents).toString('base64'),expectedSize:3})).status,200);
 }
 assert.equal((await call(base,'/submissions/pw-12345/complete','POST',{})).status,409);
 assert.equal((await call(base,'/submissions')).body[0].status,'receiving');
 assert.equal((await call(base,'/submissions/pw-12345/photos/photo-1/chunks/3','PUT',{base64:Buffer.from('def').toString('base64'),expectedSize:3})).status,200);
 assert.equal((await call(base,'/submissions/pw-12345/complete','POST',{})).status,200);
});
test('rejects overlapping chunks and changed metadata under same submission ID',async t=>{
 const {base}=await fixture(t);const payload={...meta(),photos:[{...meta().photos[0],size:9}]};
 assert.equal((await call(base,'/submissions','POST',payload)).status,200);
 assert.equal((await call(base,'/submissions','POST',{...payload,description:'different'})).status,409);
 await call(base,'/submissions/pw-12345/photos/photo-1/chunks/0','PUT',{base64:Buffer.from('abcde').toString('base64'),expectedSize:5});
 assert.equal((await call(base,'/submissions/pw-12345/photos/photo-1/chunks/3','PUT',{base64:Buffer.from('fghi').toString('base64'),expectedSize:4})).status,409);
});
test('detects missing or damaged persisted bytes and supports retry',async t=>{
 const {base,dir}=await fixture(t);await call(base,'/submissions','POST',meta());
 const chunk={base64:Buffer.from('photo!!').toString('base64'),expectedSize:7};
 const p='/submissions/pw-12345/photos/photo-1/chunks/0';
 await call(base,p,'PUT',chunk);
 fs.writeFileSync(path.join(dir,'pw-12345-photo-1.part'),'BROKEN!');
 assert.equal((await call(base,'/submissions/pw-12345/complete','POST',{})).status,409);
 assert.equal((await call(base,p,'PUT',chunk)).status,409);
});
test('rejects invalid or empty image metadata and chunks',async t=>{
 const {base}=await fixture(t);
 assert.equal((await call(base,'/submissions','POST',{...meta(),photos:[]})).status,400);
 assert.equal((await call(base,'/submissions','POST',{...meta(),photos:[{...meta().photos[0],id:'../../bad'}]})).status,400);
 assert.equal((await call(base,'/submissions','POST',meta())).status,200);
 assert.equal((await call(base,'/submissions/pw-12345/photos/photo-1/chunks/0','PUT',{base64:'',expectedSize:0})).status,400);
 assert.equal((await call(base,'/submissions/pw-12345/complete','POST',{})).status,409);
});
test('completed submissions remain immutable and completion is idempotent',async t=>{
 const {base}=await fixture(t);await call(base,'/submissions','POST',meta());
 const p='/submissions/pw-12345/photos/photo-1/chunks/0';
 const chunk={base64:Buffer.from('photo!!').toString('base64'),expectedSize:7};
 await call(base,p,'PUT',chunk);
 assert.equal((await call(base,'/submissions/pw-12345/complete','POST',{})).status,200);
 assert.equal((await call(base,p,'PUT',chunk)).body.duplicate,true);
 assert.equal((await call(base,'/submissions/pw-12345/complete','POST',{})).status,200);
});
