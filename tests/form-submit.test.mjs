import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(){
 const elements=new Map(),calls=[],storage=deferred(),radio=deferred(),cleanup=deferred();
 const $=key=>{if(!elements.has(key))elements.set(key,{dataset:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}});return elements.get(key);};
 const form={setAttribute(k,v){this[k]=v;}};
 const context=vm.createContext({$,form,clearTimeout(){},run:fn=>fn,values:()=>({clientToken:'token',message:'Hello'}),saveDraft:()=>{calls.push('draft');return calls.filter(c=>c==='draft').length===1?storage.promise:Promise.resolve();},validateForm:d=>d,db:async(store,op)=>{calls.push(op);if(op==='delete')await cleanup.promise;},api:()=>{calls.push('send');return radio.promise;},fill(){calls.push('fill');},feedback(message){calls.push(message);},showTab:tab=>calls.push(tab),openForm:async()=>{},poll:async()=>{}});
 vm.runInContext("let formSubmitting=false,draftTimer,boundIncident='',status={node:'node',incident:'incident',txEnabled:true};"+source.slice(source.indexOf('function formSendStatus('),source.indexOf("$('#phone-location').onclick")),context);
 return {$,calls,form,storage,radio,cleanup,context,submit:()=>form.onsubmit({preventDefault(){}})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('submit gives immediate feedback before storage, persists through radio wait, and blocks duplicates',async()=>{
 const h=harness(),sending=h.submit();
 assert.equal(h.$('#form-send').textContent,'Sending…');assert.equal(h.$('#form-send').disabled,true);
 assert.equal(h.form['aria-busy'],'true');assert.match(h.$('#traffic-send-status').textContent,/Sending to radio/);assert.equal(h.$('#traffic-send-status').hidden,false);
 await h.submit();assert.equal(h.calls.filter(c=>c==='draft').length,1);
 h.storage.resolve();await tick();assert.equal(h.calls.filter(c=>c==='send').length,1);assert.equal(h.$('#form-send').disabled,true);
 h.radio.resolve({id:'12345678'});await tick();
 assert.match(h.$('#traffic-send-status').textContent,/saved to radio.*awaiting radio ACK/);assert.equal(h.$('#form-send').textContent,'Saved to radio');assert.equal(h.$('#form-send').disabled,true);
 h.cleanup.resolve();await sending;assert.equal(h.form['aria-busy'],'false');assert(h.calls.includes('traffic'));
});
test('failed radio send keeps the draft, clears busy state and permits retry with the same token',async()=>{
 const h=harness(),sending=h.submit();h.storage.resolve();await tick();h.radio.reject(new Error('Radio request timed out'));
 await assert.rejects(sending,/timed out/);assert.equal(h.$('#form-send').disabled,false);assert.equal(h.form['aria-busy'],'false');
 assert.match(h.$('#traffic-send-status').textContent,/Send not confirmed.*draft is kept.*timed out/);assert(!h.calls.includes('delete'));assert(!h.calls.includes('fill'));
});
test('draft storage failure restores controls without sending to the radio',async()=>{
 const h=harness(),sending=h.submit();h.storage.reject(new Error('Storage unavailable'));
 await assert.rejects(sending,/Storage unavailable/);assert.equal(h.$('#form-send').disabled,false);assert(!h.calls.includes('send'));
});
test('switching radio while saving prevents submitting to the wrong node',async()=>{
 const h=harness(),sending=h.submit();vm.runInContext("status={node:'other',incident:'incident'}",h.context);h.storage.resolve();
 await assert.rejects(sending,/Radio or incident changed/);assert(!h.calls.includes('send'));assert.equal(h.$('#form-send').disabled,false);
});
