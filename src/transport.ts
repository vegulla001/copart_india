import {readChunk} from './files';
import type {Job} from './types';
const { CHUNK_BYTES } = require('../shared/policy');
export class RetryableError extends Error { constructor(message:string, public retryable=true){super(message);} }
async function request<T>(base:string,path:string,method:string,body:unknown,timeoutMs=12000):Promise<T> {
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try {
   const r=await fetch(`${base}${path}`,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   if(!r.ok) throw new RetryableError(`HTTP ${r.status}: ${(await r.text()).slice(0,140)}`,r.status===408||r.status===429||r.status>=500);
   return await r.json() as T;
 } catch(e:any) {
   if(e instanceof RetryableError) throw e;
   throw new RetryableError(e?.message || 'Connection unavailable');
 } finally {clearTimeout(timeout);}
}
export async function uploadJob(base:string,job:Job):Promise<void> {
 const {draft,id}=job;
 // The server uses client-generated IDs to deduplicate retries after lost responses.
 await request(base,'/submissions','POST',{id,category:draft.category,fields:draft.fields,description:draft.description,photos:draft.photos.map(p=>({id:p.id,name:p.name,mime:p.mime,size:p.size}))});
 for(const photo of draft.photos) {
   let offset=0;
   while(offset<photo.size) {
     const length=Math.min(CHUNK_BYTES,photo.size-offset);
     const base64=await readChunk(photo.uri,offset,length);
     await request(base,`/submissions/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo.id)}/chunks/${offset}`,'PUT',{base64,expectedSize:length},20000);
     offset+=length;
   }
 }
 await request(base,`/submissions/${encodeURIComponent(id)}/complete`,'POST',{});
}
