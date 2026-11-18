export type ServerStatus = { state: 'checking' | 'connected' | 'failed'; detail: string; checkedAt?: number };
export function normalizeServerUrl(value: string): string { return value.trim().replace(/\/+$/, ''); }
export async function checkServerHealth(baseUrl: string, timeoutMs = 3500): Promise<ServerStatus> {
  const base = normalizeServerUrl(baseUrl);
  if (!/^https?:\/\/[^\s/]+/i.test(base)) return {state:'failed', detail:'Enter a valid http:// or https:// server address',checkedAt:Date.now()};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetch(`${base}/health`, {method:'GET',signal:controller.signal, headers:{Accept:'application/json'}});
    if (!result.ok) return {state:'failed',detail:`Server returned HTTP ${result.status}`,checkedAt:Date.now()};
    const payload: unknown = await result.json();
    if (!payload || typeof payload !== 'object' || !('ok' in payload) || (payload as {ok?:unknown}).ok !== true) {
      return {state:'failed',detail:'Unexpected health response',checkedAt:Date.now()};
    }
    return {state:'connected',detail:'Backend reachable',checkedAt:Date.now()};
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {state:'failed',detail:controller.signal.aborted ? 'Connection timed out' : (message || 'Cannot reach backend'),checkedAt:Date.now()};
  } finally { clearTimeout(timer); }
}
