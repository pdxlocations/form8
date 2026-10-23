import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document={dispatchEvent(){}};
globalThis.CustomEvent=class {constructor(type,options){this.detail=options.detail;}};
let timers=[];
globalThis.setTimeout=(fn,delay)=>{timers.push({fn,delay});};
function flush(){let count=0;while(timers.length){assert.ok(++count<1000,'packet routing must terminate');timers.sort((a,b)=>a.delay-b.delay);timers.shift().fn();}}
const id=n=>n.toString(16).padStart(32,'0');
let generation=0;
async function fresh(){timers=[];return (await import(`./network.js?test=${++generation}`)).simulator;}
test('three located nodes include a repeater and valid preloaded forms and chat',async()=>{
 const s=await fresh();assert.equal(s.nodes.length,3);
 assert.equal(s.nodes[2].config.callsign,'REPEATER');assert.ok(s.nodes[2].config.relayEnabled);
 for(let i=0;i<3;i++){
  const status=await s.request(i,'status');assert.ok(status.location.fresh);assert.ok(status.location.lat>45);
  const forms=await s.request(i,'forms');assert.equal(forms.total,2);
  for(const meta of forms.forms){const record=await s.request(i,`form?id=${meta.id}`);assert.ok(JSON.parse(record.body).message.includes('EXERCISE'));}
  assert.equal((await s.request(i,'chat')).messages.length,3);
 }
});
test('packets take two delayed hops through repeater and return acknowledgements',async()=>{
 const s=await fresh();await s.request(0,'forms',{clientToken:id(1),message:'Exercise report',subject:'Supply request',recipient:'*',priority:0});
 assert.ok(!s.nodes[1].forms[id(1)]);assert.ok(timers.some(t=>t.delay>=1000));
 // Complete the original send only: the remote station still awaits the relay.
 timers.sort((a,b)=>a.delay-b.delay);timers.shift().fn();timers.shift().fn();
 assert.ok(s.nodes[2].forms[id(1)]);assert.ok(!s.nodes[1].forms[id(1)]);
 flush();assert.ok(s.nodes[1].forms[id(1)].meta.relayed);
 assert.equal(s.nodes[0].forms[id(1)].meta.receipts.length,3);
 await s.request(1,'ack',{id:id(1)});flush();
 assert.ok(s.nodes[0].forms[id(1)].meta.receipts.find(r=>r.id===s.nodes[1].id).human);
});
test('disabling repeater forwarding prevents remote delivery; chat and reactions relay',async()=>{
 const s=await fresh();await s.request(2,'config',{relayEnabled:false});
 await s.request(0,'forms',{clientToken:id(2),message:'No relay',recipient:'*',priority:0});flush();
 assert.ok(!s.nodes[1].forms[id(2)]);assert.ok(s.nodes[2].forms[id(2)]);
 await s.request(2,'config',{relayEnabled:true});
 await s.request(0,'chat',{clientToken:id(3),incident:s.nodes[0].incident,type:'chat-message',text:'Checking in'});flush();
 assert.ok((await s.request(1,'chat')).messages.some(m=>m.id===id(3)));
 await s.request(1,'chat',{clientToken:id(4),incident:s.nodes[1].incident,type:'chat-reaction',target:id(3),emoji:'👍',active:true});flush();
 assert.equal((await s.request(0,'chat')).messages.find(m=>m.id===id(3)).reactions.length,1);
});
test('radio frequency, incidents and transmission settings control delivery',async()=>{
 const s=await fresh();await s.request(1,'config',{primary:920});
 await s.request(0,'forms',{clientToken:id(5),message:'Other channel',recipient:'*',priority:0});flush();assert.ok(!s.nodes[1].forms[id(5)]);
 await s.request(1,'config',{primary:919.5});
 await s.request(1,'incident',{name:'Other exercise',id:'0000000000000099'});flush();
 await s.request(0,'forms',{clientToken:id(6),message:'Other incident',recipient:'*',priority:0});flush();assert.ok(!s.nodes[1].forms[id(6)]);
 await s.request(0,'config',{txEnabled:false});
 await s.request(0,'forms',{clientToken:id(7),message:'Local',recipient:'*',priority:0});flush();assert.ok(!s.nodes[2].forms[id(7)]);
});
