const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SAFE_ID = /^[a-zA-Z0-9-]{5,100}$/;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_CHUNK_BYTES = 192 * 1024;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function createApp({dataDir=path.join(__dirname,'data'),failureRate=0,delayMs=0,random=Math.random}={}){
 fs.mkdirSync(dataDir,{recursive:true});
 const submissionsPath=path.join(dataDir,'submissions.json');
 let records=fs.existsSync(submissionsPath)?JSON.parse(fs.readFileSync(submissionsPath,'utf8')):{};
 function persist(){const temp=submissionsPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(records,null,2));fs.renameSync(temp,submissionsPath);}
 function reply(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end(JSON.stringify(body));}
 function photoPath(record,photo){return path.join(dataDir,`${record.id}-${photo.id}.part`);}
 function photoComplete(record,photo){
  const file=photoPath(record,photo);
  if(!fs.existsSync(file)||fs.statSync(file).size!==photo.size)return false;
  const chunks=Object.entries(photo.chunks).map(([offset,value])=>({offset:Number(offset),size:value.size,checksum:value.sha256})).sort((a,b)=>a.offset-b.offset);
  let cursor=0;
  const fd=fs.openSync(file,'r');
  try{
   for(const chunk of chunks){
    if(!Number.isSafeInteger(chunk.offset)||chunk.offset!==cursor||!Number.isSafeInteger(chunk.size)||chunk.size<=0||chunk.size>MAX_CHUNK_BYTES||typeof chunk.checksum!=='string')return false;
    const bytes=Buffer.alloc(chunk.size);
    if(fs.readSync(fd,bytes,0,chunk.size,chunk.offset)!==chunk.size||sha256(bytes)!==chunk.checksum)return false;
    cursor+=chunk.size;
   }
  }finally{fs.closeSync(fd);}
  return cursor===photo.size;
 }
 async function handler(req,res){
  if(req.method==='OPTIONS')return reply(res,200,{});
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'&&req.method==='GET')return reply(res,200,{ok:true});
  if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
  if(random()<failureRate)return reply(res,503,{error:'Simulated bad dealership network'});
  let body={};
  if(req.method==='POST'||req.method==='PUT'){
   try{let s='';for await(const piece of req){s+=piece;if(s.length>2_000_000)throw Error('Body too large');}body=JSON.parse(s||'{}');}
   catch{return reply(res,400,{error:'Invalid JSON or request too large'});}
  }
  if(url.pathname==='/submissions'&&req.method==='POST'){
   if(!SAFE_ID.test(body.id||'')||typeof body.description!=='string'||!body.description.trim()||typeof body.category!=='string'||!body.fields||typeof body.fields!=='object'||Array.isArray(body.fields)||!Array.isArray(body.photos)||!body.photos.length||!body.photos.every(p=>SAFE_ID.test(p.id||'')&&Number.isSafeInteger(p.size)&&p.size>0&&p.size<=MAX_PHOTO_BYTES&&typeof p.name==='string'&&typeof p.mime==='string')||new Set(body.photos.map(p=>p.id)).size!==body.photos.length)return reply(res,400,{error:'Invalid submission'});
   const manifest={id:body.id,category:body.category,fields:body.fields,description:body.description,photos:body.photos.map(({id,name,mime,size})=>({id,name,mime,size}))};
   if(records[body.id]){
    if(JSON.stringify(records[body.id].manifest)!==JSON.stringify(manifest))return reply(res,409,{error:'Submission ID already used for different content'});
   } else {
    records[body.id]={...manifest,manifest,photos:manifest.photos.map(p=>({...p,chunks:{}})),status:'receiving'};
    persist();
   }
   return reply(res,200,{id:body.id,status:records[body.id].status});
  }
  const m=url.pathname.match(/^\/submissions\/([^/]+)\/photos\/([^/]+)\/chunks\/(\d+)$/);
  if(m&&req.method==='PUT'){
   const record=records[m[1]];if(!record)return reply(res,404,{error:'Submission not found'});
   const photo=record.photos.find(p=>p.id===m[2]);if(!photo)return reply(res,404,{error:'Photo not found'});
   const offset=Number(m[3]);
   if(!Number.isSafeInteger(offset)||offset<0||offset>=photo.size)return reply(res,400,{error:'Invalid offset'});
   if(typeof body.base64!=='string'||!body.base64||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64))return reply(res,400,{error:'Invalid chunk'});
   const raw=Buffer.from(body.base64,'base64');
   if(!Number.isSafeInteger(body.expectedSize)||raw.length!==body.expectedSize||raw.length===0||raw.length>MAX_CHUNK_BYTES||offset+raw.length>photo.size)return reply(res,400,{error:'Chunk length mismatch'});
   const checksum=sha256(raw);
   const existing=photo.chunks[offset];
   if(existing){
    if(existing.size!==raw.length||existing.sha256!==checksum)return reply(res,409,{error:'Conflicting chunk retry'});
    // A lost acknowledgement is safe to replay, but verify that disk contents still match.
    if(!fs.existsSync(photoPath(record,photo)))return reply(res,409,{error:'Persisted photo bytes missing'});
    const fd=fs.openSync(photoPath(record,photo),'r');
    try{const buf=Buffer.alloc(raw.length);if(fs.readSync(fd,buf,0,raw.length,offset)!==raw.length||sha256(buf)!==checksum)return reply(res,409,{error:'Persisted photo bytes corrupted'});}finally{fs.closeSync(fd);}
    return reply(res,200,{ok:true,offset,duplicate:true});
   }
   if(record.status==='submitted')return reply(res,409,{error:'Submission already finalized'});
   // Never allow overlap with a previously persisted range, including different offsets.
   for(const [at,chunk] of Object.entries(photo.chunks)){
    if(offset<Number(at)+chunk.size&&Number(at)<offset+raw.length)return reply(res,409,{error:'Overlapping chunk'});
   }
   const target=photoPath(record,photo);
   const fd=fs.openSync(target,fs.existsSync(target)?'r+':'w+');
   try{fs.writeSync(fd,raw,0,raw.length,offset);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   photo.chunks[offset]={sha256:checksum,size:raw.length};persist();
   return reply(res,200,{ok:true,offset,duplicate:false});
  }
  const complete=url.pathname.match(/^\/submissions\/([^/]+)\/complete$/);
  if(complete&&req.method==='POST'){
   const record=records[complete[1]];if(!record)return reply(res,404,{error:'Submission not found'});
   if(record.status==='submitted')return reply(res,200,{status:'submitted',id:record.id});
   for(const photo of record.photos){
    if(!photoComplete(record,photo))return reply(res,409,{error:`Incomplete or corrupted photo ${photo.id}`});
   }
   record.status='submitted';record.submittedAt=new Date().toISOString();persist();return reply(res,200,{status:'submitted',id:record.id});
  }
  if(url.pathname==='/submissions'&&req.method==='GET')return reply(res,200,Object.values(records).map(r=>({id:r.id,category:r.category,status:r.status,photos:r.photos.length})));
  return reply(res,404,{error:'Not found'});
 }
 return http.createServer((req,res)=>{handler(req,res).catch(e=>reply(res,500,{error:e.message}));});
}
module.exports={createApp};
