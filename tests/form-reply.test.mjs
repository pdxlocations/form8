import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {canReplyToForm,formReplyDraft} from '../web/model.js';
const station={node:'receiver',callsign:'RECV-1',incident:'incident'};
const record={meta:{id:'a'.repeat(32),origin:'sender',sender:'SEND-2',incident:'incident',priority:2},body:JSON.stringify({sender:'SEND-2',recipient:'*',from:'Supply officer',subject:'Water',message:'Need water'})};
test('received broadcast replies target the original sender and use the receiving callsign',()=>{
 assert.equal(canReplyToForm(record.meta,station),true);
 assert.deepEqual(formReplyDraft(record,station),{parent:record.meta.id,subject:'Re: Water',to:'Supply officer',from:'RECV-1',recipient:'SEND-2',priority:2,boundIncident:'incident'});
 assert.equal(canReplyToForm(record.meta,{...station,node:'sender'}),false);
 assert.throws(()=>formReplyDraft(record,{...station,node:'sender'}),/received messages/);
});
test('directed replies swap name fields, omit original approval/body/location, and keep the source incident',()=>{
 const reply=formReplyDraft({...record,body:JSON.stringify({sender:'SEND-2',recipient:'RECV-1',from:'Supply officer',to:'Incident commander',message:'Original',approvedBy:'Approver',location:{lat:1,lon:2}})}, {...station,incident:'different'});
 assert.equal(reply.from,'Incident commander');assert.equal(reply.to,'Supply officer');assert.equal(reply.boundIncident,'incident');
 assert.equal(reply.message,undefined);assert.equal(reply.approvedBy,undefined);assert.equal(reply.location,undefined);
});
test('missing optional name fields use callsigns rather than undefined; legacy sender metadata remains usable',()=>{
 const r={...record,body:JSON.stringify({sender:'SEND-2',recipient:'RECV-1'})};
 const reply=formReplyDraft(r,station);assert.equal(reply.from,'RECV-1');assert.equal(reply.to,'SEND-2');
 assert.equal(canReplyToForm({sender:'SEND-2'},station),true);assert.equal(canReplyToForm({sender:'RECV-1'},station),false);
});
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function harness(fail=false){
 const calls=[];let draft;
 const context=vm.createContext({status:station,draftTimer:1,formReplyDraft,clearTimeout:()=>calls.push('cancel timer'),saveDraft:async()=>{calls.push('save');if(fail)throw Error('Storage unavailable');},fill:value=>{draft=value;},showTab:tab=>calls.push(tab),form:{scrollIntoView:()=>calls.push('scroll composer'),elements:{message:{focus:()=>calls.push('focus message')}}},feedback:(message,error)=>calls.push({message,error}),$:()=>({scrollIntoView:()=>calls.push('scroll feedback')})});
 vm.runInContext(source.slice(source.indexOf('async function replyToForm('),source.indexOf('function renderForm(')),context);
 return {calls,get draft(){return draft;},reply:()=>context.replyToForm(record)};
}
test('receiver Reply saves the existing draft, opens/focuses the composer, and saves a fresh linked reply',async()=>{
 const h=harness();await h.reply();assert.deepEqual(h.calls.slice(0,6),['cancel timer','save','compose','scroll composer','focus message','save']);
 assert.match(h.calls[6].message,/Reply to SEND-2/);assert.equal(h.draft.parent,record.meta.id);
});
test('failed local draft storage produces a visible error and preserves the existing draft',async()=>{
 const h=harness(true);await h.reply();assert.equal(h.draft,undefined);assert.equal(h.calls[2].error,true);assert.match(h.calls[2].message,/Storage unavailable/);assert.equal(h.calls[3],'scroll feedback');
});
