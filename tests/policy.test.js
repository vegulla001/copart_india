const {test}=require('node:test');
const assert=require('node:assert/strict');
const {delayForAttempt,eligible,categoryFields,validateDraft,MAX_ATTEMPTS}=require('../shared/policy');
test('exponential backoff is bounded',()=>{assert.equal(delayForAttempt(1),1000);assert.equal(delayForAttempt(4),8000);assert.equal(delayForAttempt(30),300000);});
test('only due queued or retrying work is eligible',()=>{assert.equal(eligible({status:'retrying',nextAttemptAt:12},11),false);assert.equal(eligible({status:'queued',nextAttemptAt:12},12),true);assert.equal(eligible({status:'submitted',nextAttemptAt:0},100),false);});
test('category schema allows a second category without changing queue',()=>{assert.ok(categoryFields('agriculture').some(x=>x.key==='hours'));assert.ok(categoryFields('construction').some(x=>x.key==='year'));});
test('validates mandatory metadata and photos',()=>{const draft={category:'construction',fields:{make:'CAT',model:'320',year:'2022'},description:'Small scratches',photos:[{id:'a'}]};assert.equal(validateDraft(draft),null);assert.match(validateDraft({...draft,photos:[]}),/photo/);assert.match(validateDraft({...draft,fields:{make:'CAT'}}),/Model/);});
test('retry cap documented',()=>assert.equal(MAX_ATTEMPTS,8));
