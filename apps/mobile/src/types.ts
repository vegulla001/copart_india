export type Photo = { id: string; uri: string; name: string; mime: string; size: number };
export type Draft = { category: string; fields: Record<string,string>; description: string; photos: Photo[] };
export type Status = 'queued'|'sending'|'retrying'|'submitted'|'failed';
export type Job = { id: string; draft: Draft; status: Status; attempts: number; nextAttemptAt: number; lastError?: string; updatedAt: number };
