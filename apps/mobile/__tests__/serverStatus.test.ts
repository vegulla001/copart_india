import {checkServerHealth,normalizeServerUrl} from '../src/serverStatus';

describe('backend connection status', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

  it('normalizes a trailing slash and whitespace', () => {
    expect(normalizeServerUrl(' http://192.168.0.20:4000/// ')).toBe('http://192.168.0.20:4000');
  });
  it('does not fetch when the URL is invalid', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    await expect(checkServerHealth('not a url')).resolves.toMatchObject({state:'failed'});
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('reports CONNECTED for an acknowledged health response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ok:true,json:async()=>({ok:true})});
    global.fetch = mockFetch as unknown as typeof fetch;
    await expect(checkServerHealth('http://192.168.0.20:4000/')).resolves.toMatchObject({state:'connected'});
    expect(mockFetch).toHaveBeenCalledWith('http://192.168.0.20:4000/health',expect.objectContaining({method:'GET'}));
  });
  it('reports FAILED when backend responds with an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok:false,status:503}) as unknown as typeof fetch;
    await expect(checkServerHealth('http://localhost:4000')).resolves.toMatchObject({state:'failed',detail:'Server returned HTTP 503'});
  });
  it('reports FAILED for a malformed health payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok:true,json:async()=>({ok:false})}) as unknown as typeof fetch;
    await expect(checkServerHealth('http://localhost:4000')).resolves.toMatchObject({state:'failed',detail:'Unexpected health response'});
  });
  it('reports FAILED for a network rejection', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed')) as unknown as typeof fetch;
    await expect(checkServerHealth('http://localhost:4000')).resolves.toMatchObject({state:'failed',detail:'Network request failed'});
  });
  it('aborts a hung health check after its timeout', async () => {
    jest.useFakeTimers();
    const mockFetch = jest.fn().mockImplementation((_url:string,options:{signal:AbortSignal})=>new Promise((_resolve,reject)=>{
      options.signal.addEventListener('abort',()=>reject(new Error('aborted')));
    }));
    global.fetch = mockFetch as unknown as typeof fetch;
    const result = checkServerHealth('http://localhost:4000',100);
    await jest.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toMatchObject({state:'failed',detail:'Connection timed out'});
  });
});
