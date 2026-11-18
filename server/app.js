const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function createApp({dataDir=path.join(__dirname,'data'),failureRate=0,delayMs=0,random=Math.random}={}){
 fs.mkdirSync(dataDir,{recursive:true});
 const submissionsPath=path.join(dataDir,'submissions.json');
 let records=fs.existsSync(submissionsPath)?JSON.parse(fs.readFileSync(submissionsPath,'utf8')):{};
 function persist(){const temp=submissionsPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(records,null,2));fs.renameSync(temp,submissionsPath);}
 function reply(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end(JSON.stringify(body));}
 async function handler(req,res){
  if(req.method==='OPTIONS')return reply(res,200,{});
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'&&req.method==='GET')return reply(res,200,{ok:true});
  if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
  if(random()<failureRate)return reply(res,503,{error:'Simulated bad dealership network'});
  let body={};
  if(req.method==='POST'||req.method==='PUT'){
   try {let s='';for await(const piece of req){s+=piece;if(s.length>2_000_000)throw Error('Body too large');}body=JSON.parse(s||'{}');}
   catch(e){return reply(res,400,{error:'Invalid JSON or request too large'});}
  }
  if(url.pathname==='/submissions'&&req.method==='POST'){
   if(typeof body.id!=='string'||!Array.isArray(body.photos)||!body.description)return reply(res,400,{error:'Invalid submission'});
   if(!/^[a-zA-Z0-9-]{5,100}$/.test(body.id))return reply(res,400,{error:'Invalid id'});
   if(!records[body.id]){
    records[body.id]={id:body.id,category:body.category,fields:body.fields,description:body.description,photos:body.photos.map(p=>({id:p.id,name:p.name,mime:p.mime,size:p.size,chunks:{}})),status:'receiving'};
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
   if(typeof body.base64!=='string'||!/^[a-zA-Z0-9+/]*={0,2}$/.test(body.base64))return reply(res,400,{error:'Invalid chunk'});
   const raw=Buffer.from(body.base64,'base64');
   if(raw.length!==body.expectedSize||offset+raw.length>photo.size)return reply(res,400,{error:'Chunk length mismatch'});
   const checksum=crypto.createHash('sha256').update(raw).digest('hex');
   const existing=photo.chunks[offset];
   if(existing&&existing!==checksum)return reply(res,409,{error:'Conflicting chunk retry'});
   const target=path.join(dataDir,`${record.id}-${photo.id}.part`);
   const fd=fs.openSync(target,fs.existsSync(target)?'r+':'w+');
   try{fs.writeSync(fd,raw,0,raw.length,offset);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   photo.chunks[offset]=checksum;persist();
   return reply(res,200,{ok:true,offset,duplicate:!!existing});
  }
  const complete=url.pathname.match(/^\/submissions\/([^/]+)\/complete$/);
  if(complete&&req.method==='POST'){
   const record=records[complete[1]];if(!record)return reply(res,404,{error:'Submission not found'});
   for(const photo of record.photos){
    const offsets=Object.keys(photo.chunks).map(Number).sort((a,b)=>a-b);
    let expected=0;
    for(const offset of offsets){if(offset!==expected)return reply(res,409,{error:`Missing photo bytes at ${expected}`});
      // Read the actual persisted range to ensure complete coverage; chunk sizes are encoded in the file.
      const next=offsets.find(x=>x>offset);expected=next??photo.size;
    }
    if(photo.size>0&&offsets[0]!==0)return reply(res,409,{error:'Photo is incomplete'});
    const file=path.join(dataDir,`${record.id}-${photo.id}.part`);
    if(photo.size>0&&(!fs.existsSync(file)||fs.statSync(file).size!==photo.size))return reply(res,409,{error:'Photo file is incomplete'});
   }
   record.status='submitted';record.submittedAt=new Date().toISOString();persist();return reply(res,200,{status:'submitted',id:record.id});
  }
  if(url.pathname==='/submissions'&&req.method==='GET')return reply(res,200,Object.values(records).map(r=>({id:r.id,category:r.category,status:r.status,photos:r.photos.length})));
  return reply(res,404,{error:'Not found'});
 }
 return http.createServer((req,res)=>{handler(req,res).catch(e=>reply(res,500,{error:e.message}));});
}
module.exports={createApp};
