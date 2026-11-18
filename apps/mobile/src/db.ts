import * as SQLite from 'expo-sqlite';
import type {Job} from './types';
const db = SQLite.openDatabaseSync('pw-intake.db');
db.execSync(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
export function putJob(job: Job) { db.runSync('INSERT OR REPLACE INTO jobs(id,body,updated_at) VALUES(?,?,?)', job.id, JSON.stringify(job), Date.now()); }
export function getJobs(): Job[] { return db.getAllSync<{body:string}>('SELECT body FROM jobs ORDER BY updated_at DESC').map(r=>JSON.parse(r.body)); }
export function getJob(id: string): Job | undefined { const r=db.getFirstSync<{body:string}>('SELECT body FROM jobs WHERE id=?',id); return r?JSON.parse(r.body):undefined; }
export function updateJob(id: string, change: Partial<Job>): Job { const prev=getJob(id); if (!prev) throw new Error('Job not found'); const next={...prev,...change,updatedAt:Date.now()}; putJob(next); return next; }
export function recoverInterruptedJobs() { for(const j of getJobs()) if(j.status==='sending') updateJob(j.id,{status:'queued',nextAttemptAt:0,lastError:'Recovered after app restart'}); }
export function getServerUrl() {return db.getFirstSync<{value:string}>('SELECT value FROM preferences WHERE key=?','server_url')?.value ?? 'http://10.0.2.2:4000';}
export function setServerUrl(url: string) {db.runSync('INSERT OR REPLACE INTO preferences(key,value) VALUES(?,?)','server_url',url.trim().replace(/\/$/,''));}
