import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {hasDraftContent} from '../web/model.js';
import {NrfCompanionApi} from '../companion/nrf-api.js';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('node workspace switch preserves A drafts, archives, chat and edited settings without exposing them on B',async()=>{
 const nodes=new Map(),elements=new Map();let current={clientToken:'a',subject:'A draft'};
 const store=node=>{if(!nodes.has(node))nodes.set(node,{drafts:new Map(),archives:new Map(),settings:new Map()});return nodes.get(node);};
 const $=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:true,dataset:{},replaceChildren(){this.children=[];}});return elements.get(id);};
 const fields=[{name:'callsign',value:'EDIT-A',checked:false}];fields.namedItem=name=>fields.find(f=>f.name===name);$('#radio-settings').elements=fields;
 $('#chat-text').value='A unsent text';$('#all-incidents').checked=true;
 store('A').archives.set('shared-id',{id:'shared-id',body:'A archive'});store('B').archives.set('shared-id',{id:'shared-id',body:'B archive'});
 const context=vm.createContext({hasDraftContent,draftDefaults:{},draftValues:()=>structuredClone(current),$,window:{addEventListener(){}},localStorage:{setItem(){}},clearTimeout(){},
  waitForLocalStorage:p=>p,claimLegacyClientData:async node=>store(node),
  db:async(name,action,value,target=context.database)=>{const map=(await target)[name];if(action==='get')return structuredClone(map.get(value));if(action==='getAll')return structuredClone([...map.values()]);if(action==='put')map.set(value.id,structuredClone(value));},
  values:()=>structuredClone(current),fill:(value={clientToken:'new',subject:''})=>{current=structuredClone(value);},
  setTrafficView(){},resetChat(){},chatControls(){},positionClient:{update(){}},mapPanel:{update(){}},formSendStatus(){},draftList:async()=>{},loadArchives:async()=>{},renderLegacyClientData:async()=>{},
  workspaceNode:'A',workspaceEpoch:0,workspaceSwitching:false,database:Promise.resolve(store('A')),draftTimer:null,status:{node:'A'},
  chatIncident:'incident-A',settingsDirty:true,settingsLoaded:true,offset:20,total:2,selectedForm:'A-form',displayedRecord:'A',openRecord:{},openingForm:{},messageNeighbors:{}});
 vm.runInContext(source.slice(source.indexOf('async function persistWorkspaceView'),source.indexOf('function radioClockKey')),context);
 await context.switchWorkspace('B');
 assert.equal(current.subject,'');assert.equal($('#chat-text').value,'');assert.equal($('#all-incidents').checked,false);assert.equal(context.selectedForm,null);assert.equal(context.settingsDirty,false);
 assert.equal((await context.db('archives','get','shared-id')).body,'B archive');
 current={clientToken:'b',subject:'B draft'};$('#chat-text').value='B text';fields[0].value='EDIT-B';context.settingsDirty=true;context.chatIncident='incident-B';
 await context.switchWorkspace('A');
 assert.equal(current.subject,'A draft');assert.equal($('#chat-text').value,'A unsent text');assert.equal(fields[0].value,'EDIT-A');assert.equal($('#all-incidents').checked,true);
 assert.equal((await context.db('archives','get','shared-id')).body,'A archive');
 assert.equal(store('A').drafts.has('b'),false);assert.equal(store('B').drafts.has('a'),false);
 assert.equal(context.workspaceSwitching,false);assert.equal($('#form8').inert,false);
});

test('late HTTP results are rejected after switching nodes, including A → B → A',async()=>{
 const gate=deferred();const context=vm.createContext({workspaceEpoch:1,workspaceSwitching:false,AbortSignal,
  fetch:async()=>{await gate.promise;return {ok:true,json:async()=>({forms:['old A']})};}});
 vm.runInContext(source.slice(source.indexOf('async function api('),source.indexOf('function feedback(')),context);
 const request=context.api('forms');context.workspaceEpoch+=2;gate.resolve();
 await assert.rejects(request,error=>error.code==='NODE_CHANGED');
});

test('native connection generation rejects late replies even before a new node status loads',async()=>{
 const gate=deferred();let generation=1;
 const context=vm.createContext({workspaceEpoch:1,workspaceSwitching:false,Form8Native:{isNative:()=>true,connectionGeneration:()=>generation,request:async()=>{await gate.promise;return {status:200,data:{forms:['old node']}};}}});
 vm.runInContext(source.slice(source.indexOf('async function api('),source.indexOf('function feedback(')),context);
 const request=context.api('forms');generation++;gate.resolve();await assert.rejects(request,error=>error.code==='NODE_CHANGED');
});

test('nRF A → B → A reloads only that radio’s saved forms and chat',async()=>{
 const saved=new Map(),calls=[];let node='a'.repeat(16);
 const status=()=>({node,peers:[],incident:'c'.repeat(16),incidentName:'Shared incident',callsign:node[0]==='a'?'NODE-A':'NODE-B',txEnabled:false,radioReady:true,pending:[],events:[]});
 const api=new NrfCompanionApi(async(op,data)=>{calls.push({node,op,data});if(['hello','status'].includes(op))return status();return {queued:true};},{storeFactory:id=>({async read(){return structuredClone(saved.get(id)||{records:[],incidents:[],sequence:0,order:0,chatRevision:0});},async write(state){saved.set(id,structuredClone(state));}})});
 await api.connect();await api.request('forms',{clientToken:'1'.repeat(32),message:'A form',subject:'A subject',recipient:'*',priority:0});await api.request('chat',{clientToken:'2'.repeat(32),type:'chat-message',text:'A text'});
 api.invalidateConnection();node='b'.repeat(16);await api.connect();assert.equal((await api.request('forms')).total,0);assert.equal((await api.request('chat')).messages.length,0);
 await api.request('forms',{clientToken:'3'.repeat(32),message:'B form',subject:'B subject',recipient:'*',priority:0});
 api.invalidateConnection();node='a'.repeat(16);await api.connect();const traffic=await api.request('forms');assert.equal(traffic.total,1);assert.equal(traffic.forms[0].subject,'A subject');assert.equal((await api.request('chat')).messages[0].text,'A text');
 assert(saved.has('a'.repeat(16)));assert(saved.has('b'.repeat(16)));
});

test('nRF handoff cancels queued writes and commands after an awaited storage save',async()=>{
 const gate=deferred(),calls=[];let blocked=false;
 const status={node:'a'.repeat(16),peers:[],incident:'c'.repeat(16),callsign:'NODE-A',txEnabled:false,radioReady:true,pending:[],events:[]};
 const api=new NrfCompanionApi(async(op)=>{calls.push(op);return ['hello','status'].includes(op)?status:{queued:true};},{storeFactory:()=>({read:async()=>({records:[],incidents:[],order:0,sequence:0}),write:async()=>{if(blocked)await gate.promise;}})});
 await api.connect();calls.length=0;blocked=true;
 const first=api.request('forms',{clientToken:'1'.repeat(32),message:'A only',recipient:'*',priority:0});
 const queued=api.request('forms',{clientToken:'2'.repeat(32),message:'Never send to B',recipient:'*',priority:0});
 await new Promise(resolve=>setImmediate(resolve));api.invalidateConnection();gate.resolve();
 const results=await Promise.allSettled([first,queued]);assert(results.every(result=>result.status==='rejected'));assert(!calls.includes('publish'));
});

test('a failed new-node store load cannot label the old node’s records as the new node',async()=>{
 const A='a'.repeat(16),B='b'.repeat(16),status=node=>({node,peers:[],incident:'c'.repeat(16),callsign:'NODE-A',pending:[],events:[],txEnabled:false});
 const api=new NrfCompanionApi(async(op)=>op==='hello'?status(A):{queued:true},{storeFactory:node=>({read:async()=>{if(node===B)throw Error('Storage unavailable');return {records:[],incidents:[],order:0,sequence:0};},write:async()=>{}})});
 await api.connect();await api.request('forms',{clientToken:'1'.repeat(32),message:'Only A',recipient:'*',priority:0});api.invalidateConnection();
 await assert.rejects(api.connect(status(B)),/Storage unavailable/);
 assert.equal(api.status.node,A);assert.equal(api.state.records[0].meta.origin,A);
});

test('unexpected radio identity in a status response is rejected before reconciling records',async()=>{
 const A='a'.repeat(16),B='b'.repeat(16);let node=A;
 const api=new NrfCompanionApi(async op=>['hello','status'].includes(op)?{node,peers:[],incident:'c'.repeat(16),callsign:'NODE-A',pending:[],events:[],txEnabled:false}:{queued:true},{storeFactory:()=>({read:async()=>({records:[],incidents:[],order:0,sequence:0}),write:async()=>{}})});
 await api.connect();node=B;await assert.rejects(api.request('status'),/identity changed/);assert.equal(api.status.node,A);
});
