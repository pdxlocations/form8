import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function harness(){
 let resolve,reject;const request=new Promise((a,b)=>{resolve=a;reject=b;}),calls=[],messages=[],states=[],form={};
 const context=vm.createContext({$:()=>form,run:fn=>fn,status:{incidentName:'Practice'},deletingIncidents:new Set(),confirm:()=>true,api:async(route,body)=>{calls.push({route,body});return request;},poll:async()=>{},loadIncidents:async()=>{},loadRetainedIncidents:async()=>{},feedback:message=>messages.push(message),incidentTransitionControls:()=>states.push(vm.runInContext('incidentTransition?.kind||null',context))});
 vm.runInContext('let incidentTransition=null;'+source.slice(source.indexOf('async function joinIncident('),source.indexOf('async function loadIncidents('))+source.slice(source.indexOf('async function leaveIncident('),source.indexOf('function incidentDeleteControls(')),context);
 return {context,calls,messages,states,form,resolve,reject};
}
test('joining gives immediate feedback and blocks joining or leaving again until refresh completes',async()=>{
 const h=harness(),joining=vm.runInContext("joinIncident('Practice','42')",h.context);
 assert.equal(h.messages[0],'Joining Practice…');assert.deepEqual(h.states,['join']);assert.equal(h.calls.length,1);
 assert.equal(await vm.runInContext("joinIncident('Other','99')",h.context),false);await vm.runInContext('leaveIncident()',h.context);assert.equal(h.calls.length,1);
 h.resolve({saved:true});assert.equal(await joining,true);assert.equal(h.states.at(-1),null);assert.match(h.messages.at(-1),/^Joined Practice/);
});
test('creating an incident twice submits once and resets the form only after success',async()=>{
 const h=harness();let resets=0;const event={preventDefault(){},target:{elements:{name:{value:'New incident'}},reset(){resets++;}}};
 const creating=h.form.onsubmit(event);await h.form.onsubmit(event);assert.equal(h.calls.length,1);assert.equal(resets,0);assert.equal(h.messages[0],'Creating and joining New incident…');
 h.resolve({saved:true});await creating;assert.equal(resets,1);assert.equal(h.states.at(-1),null);
});
test('leaving gives immediate feedback and releases the membership lock on failure',async()=>{
 const h=harness(),leaving=vm.runInContext('leaveIncident()',h.context);
 assert.equal(h.messages[0],'Leaving Practice…');assert.equal(h.calls[0].route,'incident/leave');await vm.runInContext('leaveIncident()',h.context);assert.equal(h.calls.length,1);
 h.reject(Error('Radio unavailable'));await assert.rejects(leaving,/Radio unavailable/);assert.equal(h.states.at(-1),null);
 h.context.api=async()=>({saved:true});assert.equal(await vm.runInContext("joinIncident('Retry','43')",h.context),true);
});
