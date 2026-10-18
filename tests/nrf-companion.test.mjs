import test from 'node:test';
import assert from 'node:assert/strict';
import {NrfCompanionApi} from '../companion/nrf-api.js';
import {RadioRpc} from '../companion/radio-rpc.js';
import {crc32} from '../web/model.js';
const NODE='1111111111111111',PEER='2222222222222222',INCIDENT='3333333333333333',ID='a'.repeat(32);
const form={type:'net-form-8',sender:'W7ABC',recipient:'*',incident:INCIDENT,incidentName:'Test',sentAt:100,message:'Supplies needed',priority:0,subject:'Water'};
function harness(){let saved={records:[],incidents:[],sequence:0,order:0},fail=false,clock=100000;const calls=[],pending=new Map();const status={node:NODE,incident:INCIDENT,incidentName:'Test',callsign:'N7XYZ',txEnabled:true,paused:false,radioReady:true,peers:[{id:PEER,callsign:'W7ABC',online:true,incident:INCIDENT}],pending:[],events:[]};
 const stores=new Map();const factory=node=>{if(!stores.has(node))stores.set(node,{async read(){return structuredClone(saved);},async write(s){calls.push(['save']);if(fail)throw Error('disk full');saved=structuredClone(s);}});return stores.get(node);};
 const rpc=async(op,data)=>{calls.push([op,structuredClone(data)]);if(op==='hello'||op==='status')return structuredClone(status);if(op==='leave'){status.incident='0000000000000000';status.incidentName='';status.pending=[];return structuredClone(status);}if(op==='pending')return structuredClone(pending.get(data.id));if(op==='commit'){assert(saved.records.some(r=>r.meta.id===data.id),'ACK must follow durable save');status.pending=status.pending.filter(id=>id!==data.id);}if(op==='reject')status.pending=status.pending.filter(id=>id!==data.id);if(op==='publish'||op==='resend')return {queued:true};if(op==='eventsAck')status.events=status.events.filter(e=>e.seq>data.seq);return {saved:true};};
 const api=new NrfCompanionApi(rpc,{storeFactory:factory,now:()=>clock});return {api,status,calls,pending,get saved(){return saved;},fail:()=>fail=true,clock:value=>clock=value,incoming(body=form,chat=false,id=ID){const wire=JSON.stringify(body);pending.set(id,{id,incident:body.incident||INCIDENT,origin:PEER,hash:crc32(wire),priority:body.priority||0,chat,body:wire});status.pending.push(id);}};
}
test('received form is validated and durably saved before commit, then survives offline reopen',async()=>{const h=harness();h.incoming();await h.api.connect();assert(h.calls.findIndex(c=>c[0]==='save')<h.calls.findIndex(c=>c[0]==='commit'));assert.equal((await h.api.request('status')).unreadMessages,1);await h.api.request('read',{id:ID});assert.equal((await h.api.request('status')).unreadMessages,0);h.api.connected=false;assert.equal((await h.api.request('form?id='+ID)).body,JSON.stringify(form));assert.equal((await h.api.request('status')).companionConnected,false);});
test('storage failure never commits or marks a received record known',async()=>{const h=harness();await h.api.connect();h.incoming();h.fail();await assert.rejects(h.api.request('status'),/disk full/);assert(!h.calls.some(c=>c[0]==='commit'));assert.equal(h.api.state.records.length,0);});
test('invalid or conflicting body receives no commit',async()=>{const h=harness();await h.api.connect();h.incoming({...form,message:'x'.repeat(2801)});assert.match((await h.api.request('status')).receiveError,/2800/);assert(h.calls.some(c=>c[0]==='reject'));assert(!h.calls.some(c=>c[0]==='commit'));});
test('lost commit reply recovers without duplicate bodies',async()=>{const h=harness();h.incoming();await h.api.connect();h.status.pending.push(ID);await h.api.request('status');assert.equal(h.saved.records.length,1);assert.equal(h.calls.filter(c=>c[0]==='commit').length,2);});
test('submission token is idempotent and the form is saved before publish',async()=>{const h=harness();await h.api.connect();h.calls.length=0;const input={clientToken:ID,message:'Water please',recipient:'*',priority:0};await h.api.request('forms',input);await h.api.request('forms',input);assert.equal(h.saved.records.length,1);assert(h.calls.findIndex(c=>c[0]==='save')<h.calls.findIndex(c=>c[0]==='publish'));assert.equal(h.calls.filter(c=>c[0]==='publish').length,1);await assert.rejects(h.api.request('chat',{...input,type:'chat-message',text:'hi'}),/conflict/);});
test('chat accepts UTF-8, reactions, replies; excludes chat from form unread and pending counts',async()=>{const h=harness();await h.api.connect();await h.api.request('chat',{clientToken:ID,type:'chat-message',text:'Hello 👋'});await h.api.request('chat',{clientToken:'b'.repeat(32),type:'chat-message',text:'Reply',parent:ID});await h.api.request('chat',{clientToken:'c'.repeat(32),type:'chat-reaction',target:ID,emoji:'👍',active:true});const chat=await h.api.request('chat');assert.equal(chat.messages.length,2);assert.equal(chat.messages[0].reactions[0].emoji,'👍');const status=await h.api.request('status');assert.equal(status.unreadMessages,0);assert.equal(status.outgoingMessages,0);await assert.rejects(h.api.request('chat',{clientToken:'d'.repeat(32),type:'chat-message',text:'👋'.repeat(51)}),/200/);});
test('chat API pages older texts, tracks chat-only revisions, and honors unchanged versions',async()=>{const h=harness();await h.api.connect();for(let index=0;index<35;index++)await h.api.request('chat',{clientToken:(index+1).toString(16).padStart(32,'0'),type:'chat-message',text:`Message ${index}`});const latest=await h.api.request('chat');assert.equal(latest.messages.length,30);assert.equal(latest.messages[0].text,'Message 5');assert.equal(latest.allMessages.length,35);assert.equal(latest.hasOlder,true);const older=await h.api.request(`chat?before=${latest.messages[0].id}`);assert.equal(older.messages.length,5);assert.equal(older.messages[0].text,'Message 0');assert.equal(older.hasOlder,false);await h.api.request('forms',{clientToken:'e'.repeat(32),message:'Form traffic',recipient:'*',priority:0});assert.equal((await h.api.request(`chat?since=${latest.version}`)).unchanged,true);const record=h.api.state.records.find(item=>item.meta.id===latest.messages[0].id);h.status.events=[{seq:1,event:'receipt',id:record.meta.id,hash:record.meta.hash,peer:PEER,chat:true,human:false}];await h.api.request('status');const changed=await h.api.request(`chat?since=${latest.version}`);assert.equal(changed.unchanged,undefined);assert.equal(changed.messages.length,30);});
test('chat retention evicts an acknowledged event before a pending outgoing message',async()=>{const h=harness();await h.api.connect();await h.api.change(state=>{state.records=Array.from({length:96},(_,index)=>({chat:true,meta:{id:(index+1).toString(16).padStart(32,'0'),origin:NODE,order:index+1,receipts:[{id:NODE},...(index===1?[{id:PEER}]:[])]}}));});await h.api.request('chat',{clientToken:'f'.repeat(32),type:'chat-message',text:'New event'});assert(h.api.state.records.some(record=>record.meta.id==='1'.padStart(32,'0')),'pending outgoing event must be retained');assert(!h.api.state.records.some(record=>record.meta.id==='2'.padStart(32,'0')),'oldest acknowledged event should be evicted');});
test('chat retention rejects a new event rather than evicting pending outgoing messages',async()=>{const h=harness();await h.api.connect();await h.api.change(state=>{state.records=Array.from({length:96},(_,index)=>({chat:true,meta:{id:(index+1).toString(16).padStart(32,'0'),origin:NODE,order:index+1,receipts:[{id:NODE}]}}));});await assert.rejects(h.api.request('chat',{clientToken:'f'.repeat(32),type:'chat-message',text:'New event'}),/pending chat messages cannot be evicted/);assert.equal(h.api.state.records.length,96);});
test('manual ACK saves a received form before transmitting and ignores an originator human ACK',async()=>{const h=harness();h.incoming();await h.api.connect();h.calls.length=0;await h.api.request('ack',{id:ID});assert(h.calls.findIndex(c=>c[0]==='save')<h.calls.findIndex(c=>c[0]==='ack'));h.status.events=[{seq:1,event:'receipt',id:ID,peer:PEER,hash:crc32(JSON.stringify(form)),human:true,chat:false}];await h.api.request('status');assert.deepEqual(h.saved.records[0].meta.receipts.map(p=>[p.callsign,p.human]),[['N7XYZ',true],['W7ABC',false]]);});
test('repair sends the exact stored wire body; offload cancels it and keeps metadata',async()=>{const h=harness();h.incoming();await h.api.connect();h.status.events=[{seq:1,event:'repair',id:ID,hash:crc32(JSON.stringify(form))}];await h.api.request('status');assert.equal(h.calls.find(c=>c[0]==='publish')[1].body,JSON.stringify(form));await assert.rejects(h.api.request('offload',{id:ID,mode:'archive',verified:false}),/Verified/);await h.api.request('offload',{id:ID,mode:'archive',verified:true,hash:crc32(JSON.stringify(form))});assert.equal(h.saved.records[0].body,undefined);assert.equal(h.saved.records[0].meta.state,'archived');});
test('form retries wait for final transmission and back off after the initial send',async()=>{const h=harness();await h.api.connect();await h.api.request('forms',{clientToken:ID,message:'Test',recipient:'*',priority:0});await h.api.request('status');assert.equal(h.calls.filter(c=>c[0]==='publish').length,1);h.status.events=[{seq:1,event:'sent',id:ID}];await h.api.request('status');h.clock(159999);await h.api.request('status');assert.equal(h.calls.filter(c=>c[0]==='publish').length,1);h.clock(160000);await h.api.request('status');assert.equal(h.calls.filter(c=>c[0]==='publish').length,2);});
test('offline submissions remain durable and retry when the companion reconnects',async()=>{const h=harness();await h.api.connect();h.api.connected=false;await h.api.request('forms',{clientToken:ID,message:'Offline queued',recipient:'*',priority:0});assert.equal(h.saved.records.length,1);assert.equal(h.calls.filter(c=>c[0]==='publish').length,0);await h.api.connect();assert.equal(h.calls.filter(c=>c[0]==='publish').length,1);});
test('incident-bound submissions cannot leak into another incident',async()=>{const h=harness();await h.api.connect();await assert.rejects(h.api.request('forms',{clientToken:ID,boundIncident:'f'.repeat(16),message:'Wrong',recipient:'*',priority:0}),/another incident/);assert.equal(h.saved.records.length,0);});
test('RPC handles fragmented multibyte UTF-8 and serializes requests',async()=>{const sends=[],plugin={async send(d){sends.push(JSON.parse(d.data));}};const rpc=new RadioRpc(plugin,'f'.repeat(32));const first=rpc.request('hello'),second=rpc.request('status');await new Promise(r=>setImmediate(r));assert.equal(sends.length,1);const response=Buffer.from(JSON.stringify({request:1,data:{text:'👋'}})+'\n');for(const byte of response)rpc.receive(Buffer.from([byte]).toString('base64'));assert.equal((await first).text,'👋');await new Promise(r=>setImmediate(r));assert.equal(sends.length,2);rpc.receive(Buffer.from('{"request":2,"data":{"saved":true}}\n').toString('base64'));assert.equal((await second).saved,true);});

test('ESP32 chat wire bodies without incident fields are accepted using the mesh envelope',async()=>{const h=harness();const body={type:'chat-message',sender:'W7ABC',sentAt:100,text:'ESP32 hello 👋'};h.incoming(body,true);await h.api.connect();assert.equal((await h.api.request('chat')).messages[0].text,body.text);assert(h.calls.some(c=>c[0]==='commit'));assert.equal((await h.api.request('status')).unreadMessages,0);});

test('form address fields appear in traffic metadata and survive offloading, including older records',async()=>{
 const h=harness();h.incoming({...form,from:'Supply officer',to:'Incident command'});await h.api.connect();
 let list=await h.api.request('forms');assert.equal(list.forms[0].from,'Supply officer');assert.equal(list.forms[0].to,'Incident command');
 // Simulate a record created before addresses were retained in metadata.
 await h.api.change(s=>{delete s.records[0].meta.from;delete s.records[0].meta.to;});
 list=await h.api.request('forms');assert.equal(list.forms[0].from,'Supply officer');
 assert.equal((await h.api.request('form?id='+ID)).meta.to,'Incident command');
 await h.api.request('offload',{id:ID,mode:'discard'});
 list=await h.api.request('forms?history=1');assert.equal(list.forms[0].from,'Supply officer');assert.equal(list.forms[0].to,'Incident command');
 assert.equal(h.saved.records[0].body,undefined);
});

test('nRF adapter rejects ESP32 hello before changing storage or sending nRF commands',async()=>{
 const h=harness();
 await assert.rejects(h.api.connect({node:NODE,board:'Heltec V3',protocol:'form8-api-v1',storage:'radio'}),/ESP32.*Android APK/);
 assert.equal(h.api.connected,false);assert.equal(h.api.status,null);assert.deepEqual(h.calls,[]);
});

test('restoring an old ESP32 hello in companion storage does not crash on missing peers',async()=>{
 const h=harness();await h.api.connect();await h.api.change(s=>{s.lastStatus={node:NODE,protocol:'form8-api-v1',storage:'radio'};});
 h.api.connected=false;await h.api.restore(NODE);
 assert.equal(h.api.status,null);
 await assert.rejects(h.api.request('status'),/Choose a radio connection/);
});

test('archiving or removing hides a form, clears unread, and retains its delivery record',async()=>{
 const h=harness();h.incoming();await h.api.connect();
 h.status.incident='4444444444444444';await h.api.request('status');
 await h.api.request('offload',{id:ID,mode:'discard'});
 assert.equal((await h.api.request('forms?all=1')).total,0);
 assert.equal((await h.api.request('forms?all=1&history=1')).total,1);
 assert.equal((await h.api.request('status')).unreadMessages,0);
 assert.equal(h.api.state.records[0].body,undefined);
 assert.equal(h.api.state.records[0].meta.state,'discarded');
});
test('leaving an incident preserves saved forms',async()=>{
 const h=harness();h.incoming();await h.api.connect();await h.api.request('incident/leave',{});
 assert.equal(h.api.status.incident,'0000000000000000');assert.equal(h.api.state.records.length,1);
 assert.equal((await h.api.request('forms?all=1')).total,1);
});
test('removing an incident leaves it first and deletes only its records and saved entry',async()=>{
 const h=harness();h.incoming();await h.api.connect();const other='4444444444444444';
 await h.api.change(s=>{s.incidents=[{id:INCIDENT,name:'Test'},{id:other,name:'Other'}];s.records.push({...structuredClone(s.records[0]),meta:{...s.records[0].meta,id:'b'.repeat(32),incident:other}});});
 await h.api.request('incident/remove',{id:INCIDENT});
 assert.equal(h.api.status.incident,'0000000000000000');assert.equal(h.api.state.records.length,1);
 assert.equal(h.api.state.records[0].meta.incident,other);assert.equal(h.api.state.incidents.length,1);
 assert.equal(h.api.state.incidents[0].id,other);
 await assert.rejects(h.api.request('incident/remove',{id:'../bad'}),/Valid incident/);
});
test('offline active incident removal is rejected before changing records',async()=>{
 const h=harness();h.incoming();await h.api.connect();h.api.connected=false;
 await assert.rejects(h.api.request('incident/remove',{id:INCIDENT}),/Connect the radio/);
 assert.equal(h.api.state.records.length,1);
});

test('unsupported leave command preserves incident data and explains the firmware update',async()=>{
 const h=harness();h.incoming();await h.api.connect();const rpc=h.api.rpc;
 h.api.rpc=(op,data)=>op==='leave'?Promise.reject(new Error('Unknown operation')):rpc(op,data);
 await assert.rejects(h.api.request('incident/remove',{id:INCIDENT}),/Update the radio firmware/);
 assert.equal(h.api.status.incident,INCIDENT);assert.equal(h.api.state.records.length,1);
});
test('a failed incident cleanup save preserves the local forms',async()=>{
 const h=harness();h.incoming();await h.api.connect();h.fail();
 await assert.rejects(h.api.request('incident/remove',{id:INCIDENT}),/disk full/);
 assert.equal(h.api.state.records.length,1);assert.equal(h.saved.records.length,1);
});


test('manual announcement uses only the announce RPC and requires a connected active transmitter',async()=>{
 const h=harness();await h.api.connect();h.calls.length=0;
 await h.api.request('incident/announce',{});assert.deepEqual(h.calls.map(c=>c[0]),['announce']);
 h.api.connected=false;await assert.rejects(h.api.request('incident/announce',{}),/Connect the radio/);
 h.api.connected=true;h.api.status.incident='0000000000000000';await assert.rejects(h.api.request('incident/announce',{}),/Join an incident/);
 h.api.status.incident=INCIDENT;h.api.status.paused=true;await assert.rejects(h.api.request('incident/announce',{}),/unpause/);
 assert.deepEqual(h.calls.map(c=>c[0]),['announce']);
});


test('opening a committed local form does not wait behind a slow Bluetooth status request',async()=>{
 const h=harness();h.incoming();await h.api.connect();let finishStatus;const original=h.api.rpc;
 h.api.rpc=async(op,data)=>op==='status'?new Promise(resolve=>{finishStatus=resolve;}):original(op,data);
 const polling=h.api.request('status');await new Promise(resolve=>setImmediate(resolve));assert(finishStatus);
 const record=await h.api.request(`form?id=${ID}`);assert.equal(record.body,JSON.stringify(form));
 record.meta.subject='Changed copy';assert.notEqual((await h.api.request(`form?id=${ID}`)).meta.subject,'Changed copy');
 finishStatus(h.status);await polling;
});

test('one remote broadcast ACK clears outgoing count and stops retries despite offline expected stations',async()=>{
 const h=harness();const offline='dddddddddddddddd';h.status.peers.push({id:offline,callsign:'GONE',online:true,incident:INCIDENT});await h.api.connect();
 await h.api.request('forms',{clientToken:ID,message:'Broadcast with an absent station',recipient:'*',priority:0});assert.equal((await h.api.request('status')).outgoingMessages,1);
 h.status.peers.find(p=>p.id===offline).online=false;const record=h.api.state.records.find(r=>r.meta.id===ID);assert.equal(record.meta.expected.length,2);
 h.status.events=[{seq:1,event:'receipt',id:ID,hash:record.meta.hash,peer:PEER,human:false,chat:false}];assert.equal((await h.api.request('status')).outgoingMessages,0);assert(h.calls.some(c=>c[0]==='cancel'&&c[1].id===ID));
 h.clock(10000000);await h.api.request('status');assert.equal(h.calls.filter(c=>c[0]==='publish').length,1);assert.equal(h.api.state.records[0].meta.expected.length,2);
});

test('an unrelated remote ACK does not complete a callsign-addressed form',async()=>{
 const h=harness();await h.api.connect();await h.api.request('forms',{clientToken:ID,message:'For the named operator',recipient:'TARGET',priority:0});
 const record=h.api.state.records.find(r=>r.meta.id===ID);h.status.events=[{seq:1,event:'receipt',id:ID,hash:record.meta.hash,peer:PEER,human:false,chat:false}];assert.equal((await h.api.request('status')).outgoingMessages,1);
});


test('origin human ACK is rejected online and offline without saving or sending',async()=>{
 const h=harness();await h.api.connect();await h.api.request('forms',{clientToken:ID,message:'My form',recipient:'*',priority:0});const before=structuredClone(h.saved);
 for(const connected of [true,false]){h.api.connected=connected;h.calls.length=0;await assert.rejects(h.api.request('ack',{id:ID}),/originating station/);assert.deepEqual(h.saved,before);assert.equal(h.calls.length,0);}
 h.api.connected=true;h.calls.length=0;await h.api.syncKnown(true);const row=h.calls.find(c=>c[0]==='known')[1].records[0];assert.equal(row.origin,NODE);assert.equal(row.human,false);
});


test('resend preserves an acknowledged originating form and receipts and uses explicit resend RPC',async()=>{
 const h=harness();await h.api.connect();await h.api.request('forms',{clientToken:ID,message:'Original body',recipient:'*',priority:0});
 await h.api.change(s=>{s.records[0].meta.receipts.push({id:PEER,callsign:'W7ABC',human:true});});const before=structuredClone(h.saved);h.calls.length=0;
 await h.api.request('resend',{id:ID});const call=h.calls.find(c=>c[0]==='resend');assert(call);assert.equal(call[1].id,ID);assert.equal(call[1].body,h.saved.records[0].body);assert.deepEqual(h.saved,before);
});

test('resend rejects received, absent, offloaded, inactive, offline and TX-off forms without sending',async()=>{
 const h=harness();h.incoming();await h.api.connect();h.calls.length=0;await assert.rejects(h.api.request('resend',{id:ID}),/originating station/);assert.equal(h.calls.length,0);
 await h.api.change(s=>{s.records[0].meta.origin=NODE;});
 for(const change of [{connected:false},{status:{paused:true}},{status:{txEnabled:false}},{status:{incident:'f'.repeat(16)}}]){
  h.api.connected=change.connected??true;Object.assign(h.api.status,{paused:false,txEnabled:true,incident:INCIDENT},change.status);h.calls.length=0;await assert.rejects(h.api.request('resend',{id:ID}));assert.equal(h.calls.length,0);
 }
 h.api.connected=true;h.api.status.incident=INCIDENT;await h.api.change(s=>{delete s.records[0].body;});h.calls.length=0;await assert.rejects(h.api.request('resend',{id:ID}),/Stored form body/);assert.equal(h.calls.length,0);
});

test('Traffic puts newest saved forms first across pages and reader neighbors',async()=>{
 const h=harness();await h.api.connect();const ids=[];
 for(let i=25;i>0;i--){const id=i.toString(16).padStart(32,'0');ids.push(id);if(i%2){h.incoming({...form,sentAt:200+i},false,id);await h.api.request('status');}else await h.api.request('forms',{clientToken:id,message:'Outgoing '+i,recipient:'*',priority:0});}
 const expected=ids.reverse(),latest=await h.api.request('forms');
 assert.deepEqual(latest.forms.map(m=>m.id),expected.slice(0,20));
 const older=await h.api.request('forms?offset=20');assert.deepEqual(older.forms.map(m=>m.id),expected.slice(20));
 const selected=await h.api.request('forms?selected='+expected[20]);assert.equal(selected.offset,20);assert.equal(selected.previous,expected[19]);assert.equal(selected.next,expected[21]);
 h.api.connected=false;await h.api.restore(NODE);assert.deepEqual((await h.api.request('forms')).forms.map(m=>m.id),expected.slice(0,20));
});

test('Request ID reaches the radio without joining the unknown node incident or changing stored messages',async()=>{
 const h=harness();await h.api.connect();const before=structuredClone(h.saved);h.calls.length=0;
 await h.api.request('nodes/request-id',{id:PEER});assert.deepEqual(h.calls,[['requestIdentity',{id:PEER}]]);assert.deepEqual(h.saved,before);assert.equal(h.api.status.incident,INCIDENT);
 await assert.rejects(h.api.request('nodes/request-id',{id:NODE}),/another valid node/);
 await assert.rejects(h.api.request('nodes/request-id',{id:'../invalid'}),/another valid node/);
 h.api.status.txEnabled=false;await assert.rejects(h.api.request('nodes/request-id',{id:PEER}),/transmission to On/);
 h.api.status.txEnabled=true;h.api.rpc=async()=>{throw Error('Unknown operation');};await assert.rejects(h.api.request('nodes/request-id',{id:PEER}),/Update.*firmware.*Android/);
 h.api.connected=false;await assert.rejects(h.api.request('nodes/request-id',{id:PEER}),/Connect the radio/);
});
