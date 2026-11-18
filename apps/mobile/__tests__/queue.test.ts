import type {Job} from '../src/types';

jest.mock('expo-network',()=>({getNetworkStateAsync:jest.fn()}));
jest.mock('../src/db',()=>({getJobs:jest.fn(),updateJob:jest.fn(),getServerUrl:jest.fn(),recoverInterruptedJobs:jest.fn()}));
jest.mock('../src/transport',()=>({uploadJob:jest.fn(),RetryableError:class RetryableError extends Error { constructor(message:string,public retryable=true){super(message);} }}));
const Network = require('expo-network');
const db = require('../src/db');
const transport = require('../src/transport');
const {drainQueue,initQueue,retryJob} = require('../src/queue');

const job = (overrides:Partial<Job>={}):Job => ({id:'pw-test',draft:{category:'construction',fields:{make:'CAT',model:'320',year:'2021'},description:'Good condition',photos:[]},status:'queued',attempts:0,nextAttemptAt:0,updatedAt:0,...overrides});

describe('mobile offline outbox',()=>{
  beforeEach(()=>{
    jest.clearAllMocks();
    Network.getNetworkStateAsync.mockResolvedValue({isConnected:true,isInternetReachable:true});
    db.getServerUrl.mockReturnValue('http://localhost:4000');
    db.getJobs.mockReturnValue([job()]);
    transport.uploadJob.mockResolvedValue(undefined);
  });
  it('recovers interrupted jobs during initialization',()=>{
    initQueue();
    expect(db.recoverInterruptedJobs).toHaveBeenCalledTimes(1);
  });
  it('does not upload when offline',async()=>{
    Network.getNetworkStateAsync.mockResolvedValue({isConnected:false,isInternetReachable:false});
    await drainQueue();
    expect(transport.uploadJob).not.toHaveBeenCalled();
    expect(db.updateJob).not.toHaveBeenCalled();
  });
  it('marks successfully uploaded jobs as submitted',async()=>{
    await drainQueue();
    expect(db.updateJob).toHaveBeenCalledWith('pw-test',expect.objectContaining({status:'sending'}));
    expect(transport.uploadJob).toHaveBeenCalledWith('http://localhost:4000',expect.objectContaining({id:'pw-test'}));
    expect(db.updateJob).toHaveBeenCalledWith('pw-test',expect.objectContaining({status:'submitted'}));
  });
  it('preserves a transiently failed job for a retry',async()=>{
    transport.uploadJob.mockRejectedValue(new Error('Network request failed'));
    await drainQueue();
    expect(db.updateJob).toHaveBeenCalledWith('pw-test',expect.objectContaining({status:'retrying',attempts:1,lastError:'Network request failed'}));
  });
  it('marks permanent HTTP 400 as failed',async()=>{
    transport.uploadJob.mockRejectedValue(new transport.RetryableError('HTTP 400',false));
    await drainQueue();
    expect(db.updateJob).toHaveBeenCalledWith('pw-test',expect.objectContaining({status:'failed',attempts:1}));
  });
  it('does not process jobs whose retry deadline is in the future',async()=>{
    db.getJobs.mockReturnValue([job({status:'retrying',nextAttemptAt:Date.now()+60_000})]);
    await drainQueue();
    expect(transport.uploadJob).not.toHaveBeenCalled();
  });
  it('resets failed job state when manually retried',()=>{
    // Ensure drainQueue gets a pending promise and cannot update the mock before assertion.
    Network.getNetworkStateAsync.mockResolvedValue({isConnected:false});
    retryJob('pw-test');
    expect(db.updateJob).toHaveBeenCalledWith('pw-test',{status:'queued',attempts:0,nextAttemptAt:0,lastError:undefined});
  });
});
