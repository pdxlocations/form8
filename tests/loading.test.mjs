import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingIndicator} from '../web/loading.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('foreground work shows its loading message immediately and clears it on completion',async()=>{
 const element={hidden:true},loading=createLoadingIndicator(element),gate=deferred();
 const pending=loading.run('Loading messages…',()=>gate.promise,'traffic');loading.select('traffic');
 assert.equal(element.hidden,false);assert.equal(element.textContent,'Loading messages…');gate.resolve('done');
 assert.equal(await pending,'done');assert.equal(element.hidden,true);
});

test('old tab requests cannot leave a banner on another tab or clear its loading message',async()=>{
 const element={},loading=createLoadingIndicator(element),old=deferred(),next=deferred();loading.select('traffic');
 const first=loading.run('Loading messages…',()=>old.promise,'traffic');
 loading.select('chat');assert.equal(element.hidden,true);
 const second=loading.run('Loading chat…',()=>next.promise,'chat');
 old.resolve();await first;assert.equal(element.hidden,false);assert.equal(element.textContent,'Loading chat…');
 next.resolve();await second;assert.equal(element.hidden,true);
});

test('failed requests remove their loading message and preserve the error',async()=>{
 const element={},loading=createLoadingIndicator(element);
 await assert.rejects(loading.run('Refreshing data…',async()=>{throw Error('Radio unavailable');}),/Radio unavailable/);
 assert.equal(element.hidden,true);
});

test('a completed nested load restores a pending startup message without a stuck indicator',async()=>{
 const element={},loading=createLoadingIndicator(element);loading.select('traffic');
 const startup=loading.begin('Connecting to radio…'),tab=loading.begin('Loading messages…','traffic');
 assert.equal(element.textContent,'Loading messages…');tab();assert.equal(element.textContent,'Connecting to radio…');
 startup();startup();assert.equal(element.hidden,true);
});
