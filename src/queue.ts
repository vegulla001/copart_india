import * as Network from 'expo-network';
import {getJobs,updateJob,getServerUrl,recoverInterruptedJobs} from './db';
import {uploadJob,RetryableError} from './transport';
const {eligible,delayForAttempt,MAX_ATTEMPTS}=require('../shared/policy');
let running=false;
let notify:()=>void=()=>{};
export function subscribeQueue(fn:()=>void){notify=fn;return()=>{if(notify===fn) notify=()=>{};};}
export function initQueue(){recoverInterruptedJobs(); notify();}
export async function drainQueue(){
 if(running) return;
 running=true;
 try {
   const net=await Network.getNetworkStateAsync();
   if(!net.isConnected || net.isInternetReachable===false) return;
   for(const j of getJobs().filter(j=>eligible(j,Date.now())).reverse()) {
     updateJob(j.id,{status:'sending',lastError:undefined});notify();
     try {
       await uploadJob(getServerUrl(),j);
       updateJob(j.id,{status:'submitted',nextAttemptAt:0});
     } catch(e:any) {
       const retryable=!(e instanceof RetryableError)||e.retryable;
       const attempts=j.attempts+1;
       updateJob(j.id,{attempts,status:retryable&&attempts<MAX_ATTEMPTS?'retrying':'failed',nextAttemptAt:Date.now()+delayForAttempt(attempts),lastError:String(e?.message||e)});
     }
     notify();
   }
 } finally {running=false;}
}
export function retryJob(id:string){updateJob(id,{status:'queued',attempts:0,nextAttemptAt:0,lastError:undefined});notify();void drainQueue();}
