import test from 'node:test';
import assert from 'node:assert/strict';
import {createHQRequester,hqBudgetFor,HQ_TIER_BUDGET} from '../src/app/hq-request.mjs';

// A stand-in for what src/life/render.mjs returns: the four calls the requester uses.
function fakeCrowd(){
 const crowd={hqCrowd:null,enabled:0,disabled:0,budgets:[],
  enableHQCrowd(manifest,bin,{budget}){crowd.enabled++;crowd.budgets.push(budget);crowd.hqCrowd={manifest,bin};return crowd.hqCrowd;},
  disableHQCrowd(){crowd.disabled++;crowd.hqCrowd=null;},
  setHQBudget(n){crowd.budgets.push(n);}};
 return crowd;
}
const flush=()=>new Promise(r=>setTimeout(r,0));

test('budget follows ?hq= and the tier', () => {
 assert.equal(hqBudgetFor(-1,'high'),HQ_TIER_BUDGET.high);
 assert.equal(hqBudgetFor(-1,'medium'),512);
 assert.equal(hqBudgetFor(-1,'low'),0);
 assert.equal(hqBudgetFor(0,'high'),0);
 assert.equal(hqBudgetFor(null,'high'),0);
 assert.equal(hqBudgetFor(128,'high'),128);
 assert.equal(hqBudgetFor(4000,'medium'),512);
});

test('a rebuilt crowd gets its own HQ layer (the one-shot flag bug), and the pack is fetched once', async () => {
 let loads=0,current=fakeCrowd();
 const r=createHQRequester({load:async()=>{loads++;return [{archetypes:[]},new ArrayBuffer(4)];},current:()=>current});
 const first=current;
 r.ensure(first,{asked:-1,tier:'high'});r.ensure(first,{asked:-1,tier:'high'});
 await flush();
 assert.equal(first.enabled,1);assert.deepEqual(first.budgets,[1978]);
 // The life module is rebuilt (a traffic toggle): a new crowd object, no HQ on it.
 current=fakeCrowd();
 r.ensure(current,{asked:-1,tier:'high'});
 await flush();
 assert.ok(current.hqCrowd,'the rebuilt crowd must come back on HQ');
 assert.equal(current.enabled,1);
 assert.equal(loads,1,'the pack is shared, not fetched per crowd');
});

test('a crowd replaced while the pack is in flight is never enabled', async () => {
 let release,current=fakeCrowd();
 const r=createHQRequester({load:()=>new Promise(res=>{release=res;}),current:()=>current});
 const stale=current;
 r.ensure(stale,{asked:-1,tier:'high'});
 current=fakeCrowd();
 r.ensure(current,{asked:-1,tier:'high'});
 release([{archetypes:[]},new ArrayBuffer(1)]);
 await flush();
 assert.equal(stale.enabled,0,'a disposed crowd must not resurrect');
 assert.equal(current.enabled,1);
});

test('tier changes re-apply the budget; LOW turns HQ off and HIGH brings it back', async () => {
 const current=fakeCrowd();
 const r=createHQRequester({load:async()=>[{archetypes:[]},new ArrayBuffer(1)],current:()=>current});
 r.ensure(current,{asked:-1,tier:'high'});await flush();
 r.ensure(current,{asked:-1,tier:'high'});
 r.ensure(current,{asked:-1,tier:'medium'});
 assert.deepEqual(current.budgets,[1978,512]);
 r.ensure(current,{asked:-1,tier:'low'});
 assert.equal(current.disabled,1);assert.equal(current.hqCrowd,null);
 r.ensure(current,{asked:-1,tier:'high'});await flush();
 assert.ok(current.hqCrowd);assert.equal(current.enabled,2);
});

test('hq=0 never loads the pack', async () => {
 let loads=0;const current=fakeCrowd();
 const r=createHQRequester({load:async()=>{loads++;return [{},null];},current:()=>current});
 r.ensure(current,{asked:0,tier:'high'});await flush();
 assert.equal(loads,0);assert.equal(current.enabled,0);
});

test('a failed pack leaves the legacy crowd and stops retrying', async () => {
 let loads=0,errors=0;const current=fakeCrowd();
 const r=createHQRequester({load:async()=>{loads++;throw new Error('404');},current:()=>current,onError:()=>errors++});
 r.ensure(current,{asked:-1,tier:'high'});await flush();
 r.ensure(fakeCrowd(),{asked:-1,tier:'high'});await flush();
 assert.equal(loads,1);assert.equal(errors,1);assert.equal(r.failed,true);
});
