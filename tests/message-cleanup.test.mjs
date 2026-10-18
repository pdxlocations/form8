import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {crc32,verifyArchive,deliveryStatus,priorities} from '../web/model.js';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const body=JSON.stringify({message:'Supplies needed'}),meta={id:'a'.repeat(32),subject:'Supplies',state:'stored',hash:crc32(body)},record={meta,body};
function harness({confirmed=true,failSave=false,corrupt=false,changedNode=false}={}){
 const calls=[],store=new Map();
 const context=vm.createContext({status:{node:'radio1',companionStorage:false},selectedForm:null,offset:0,total:1,
  confirm:()=>confirmed,verifyArchive,localStoreName:()=> 'this node',
  api:async(path,data)=>{calls.push({path,data});return structuredClone(record);},
  db:async(storeName,action,value)=>{calls.push({storeName,action});if(failSave)throw new Error('Storage unavailable');if(action==='put')store.set(value.id,value);else{if(changedNode)context.status.node='radio2';return corrupt?{...store.get(value),body:'corrupt'}:store.get(value);}},
  loadTraffic:async()=>calls.push('list'),poll:async()=>calls.push('poll'),backToTraffic:async()=>calls.push('back'),feedback:message=>calls.push(message),
  button:(label,onclick)=>({label,onclick})});
 vm.runInContext(source.slice(source.indexOf('const messageCleanupPending='),source.indexOf('function localStoreName()')),context);
 return {context,calls,store};
}
test('list Archive fetches without marking read, verifies the saved copy, then removes only that message',async()=>{
 const h=harness();await h.context.archiveMessage(meta);
 assert.equal(h.store.get(meta.id).body,body);
 const offload=h.calls.find(c=>c.path==='offload');assert.deepEqual({...offload.data},{id:meta.id,mode:'archive',hash:meta.hash,verified:true});
 assert.ok(h.calls.findIndex(c=>c.action==='get')<h.calls.findIndex(c=>c.path==='offload'));
 assert.ok(!h.calls.some(c=>c.path==='read'));assert.ok(h.calls.includes('list'));assert.ok(!h.calls.includes('back'));
});
test('canceling either list action leaves the message untouched',async()=>{
 const h=harness({confirmed:false});await h.context.archiveMessage(meta);await h.context.removeMessage(meta);assert.deepEqual(h.calls,[]);
});
test('failed, corrupt, or interrupted archive saves never remove the original',async()=>{
 for(const options of [{failSave:true},{corrupt:true},{changedNode:true}]){
  const h=harness(options);await assert.rejects(h.context.archiveMessage(meta));assert.ok(!h.calls.some(c=>c.path==='offload'));
 }
});
test('duplicate Archive clicks share one save/removal and last-page cleanup returns to a valid page',async()=>{
 const h=harness();h.context.offset=20;h.context.total=21;
 await Promise.all([h.context.archiveMessage(meta),h.context.archiveMessage(meta)]);
 assert.equal(h.calls.filter(c=>c.path==='offload').length,1);assert.equal(h.context.offset,0);
});
test('list Remove does not create an archive or open the reader',async()=>{
 const h=harness();await h.context.removeMessage(meta);
 assert.deepEqual({...h.calls.find(c=>c.path==='offload').data},{id:meta.id,mode:'discard'});assert.equal(h.store.size,0);assert.ok(!h.calls.some(c=>c.path?.startsWith('form?')));
});
test('Traffic offers Open, Archive, and Remove only for stored message bodies',async()=>{
 const h=harness(),elements=new Map();const element=()=>({children:[],checked:false,replaceChildren(){this.children=[];},append(...items){this.children.push(...items);}});
 h.context.$=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);};
 h.context.text=(tag,value,kind)=>({...element(),tag,value,kind});h.context.deliveryStatus=deliveryStatus;h.context.priorities=priorities;h.context.messageNeighbors={};h.context.renderMessageNavigation=()=>{};
 h.context.api=async()=>({forms:[meta,{...meta,id:'archived',state:'archived'},{...meta,id:'discarded',state:'discarded'}],total:3,offset:0});
 vm.runInContext(source.slice(source.indexOf('async function loadTraffic()'),source.indexOf('async function openForm(')),h.context);await h.context.loadTraffic();
 const rows=elements.get('#traffic-list').children;
 assert.deepEqual(rows[0].children[2].children.map(b=>b.label),['Open','Archive','Remove…']);
 for(const row of rows.slice(1))assert.deepEqual(row.children[2].children.map(b=>b.label),['Open']);
});
