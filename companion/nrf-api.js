import {token,crc32,utf8,validateForm,validateChatText,chatEmojis,chatTimelinePage,deliveryStatus,canHumanAcknowledge} from '../web/model.js';
import {radioStorage} from './radio-connection.js';
const ZERO='0000000000000000', idPattern=/^[a-f0-9]{32}$/, nodePattern=/^[a-f0-9]{16}$/, callPattern=/^[A-Z0-9/-]{3,16}$/;
export class RadioStore {
 constructor(node){this.node=node;}
 async open(){if(this.db)return;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open(`form8-radio-${this.node}`,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async read(){await this.open();return new Promise((resolve,reject)=>{const tx=this.db.transaction('state'),r=tx.objectStore('state').get('radio');r.onsuccess=()=>resolve(r.result||{records:[],incidents:[],sequence:0,order:0,chatRevision:0});r.onerror=()=>reject(r.error);});}
 async write(state){await this.open();await new Promise((resolve,reject)=>{const tx=this.db.transaction('state','readwrite');tx.objectStore('state').put(state,'radio');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Companion storage save failed'));});}
}
export class NrfCompanionApi {
 constructor(rpc,{storeFactory=node=>new RadioStore(node),now=()=>Date.now()}={}){this.generation=0;this.operationGeneration=0;this.rpc=async(...args)=>{const generation=this.operationGeneration;if(generation!==this.generation)throw Error('Radio connection changed');const result=await rpc(...args);if(generation!==this.generation)throw Error('Radio connection changed');return result;};this.storeFactory=storeFactory;this.now=now;this.tail=Promise.resolve();this.status=null;this.statusAt=0;this.connected=false;this.inflight=new Map();}
 invalidateConnection(){++this.generation;this.connected=false;}
 exclusive(fn){const generation=this.generation;const p=this.tail.then(async()=>{if(generation!==this.generation)throw Error('Radio connection changed; queued request cancelled');this.operationGeneration=generation;const result=await fn();if(generation!==this.generation)throw Error('Radio connection changed');return result;});this.tail=p.catch(()=>{});return p;}
 async restore(node){return this.exclusive(async()=>{if(!nodePattern.test(node||''))return;const store=this.storeFactory(node),state=await store.read();this.store=store;this.state=state;this.statusAt=this.state.lastStatusAt||this.now();const saved=this.state.lastStatus;this.status=saved&&Array.isArray(saved.peers)&&saved.storage!=='radio'&&saved.protocol!=='form8-api-v1'?saved:null;});}
 async connect(initialStatus){return this.exclusive(async()=>{const status=initialStatus||await this.rpc('hello');if(radioStorage(status)!=='companion')throw new Error('ESP32 uses radio storage. Install the current Android APK with ESP32 Bluetooth support.');if(!nodePattern.test(status.node))throw new Error('Unrecognized Form8 node');const store=this.storeFactory(status.node),state=await store.read();this.receiveError='';this.status=status;this.connected=true;this.store=store;this.state=state;this.inflight.clear();await this.syncKnown(true);await this.reconcile(status);await this.rememberStatus();return this.status;});}
 async rememberStatus(){const snapshot=structuredClone(this.status);delete snapshot.pending;delete snapshot.events;await this.change(s=>{s.lastStatus=snapshot;s.lastStatusAt=this.now();});}
 async save(state){await this.store.write(state);this.state=state;}
 async change(fn){const next=structuredClone(this.state);const result=fn(next);await this.save(next);return result;}
 async syncKnown(reset=false,records=this.state.records){if(!records.length&&reset)await this.rpc('known',{reset:true,records:[]});for(let i=0;i<records.length;i+=16)await this.rpc('known',{reset:reset&&i===0,records:records.slice(i,i+16).map(r=>({id:r.meta.id,incident:r.meta.incident,origin:r.meta.origin,hash:r.meta.hash,body:!!r.body,chat:r.chat,human:canHumanAcknowledge(r.meta,this.status)&&r.meta.receipts.some(p=>p.id===this.status.node&&p.human)}))});}
 async reconcile(status){if(this.status?.node && status.node!==this.status.node)throw Error('Radio identity changed. Reconnect before loading messages.');this.status=status;this.statusAt=this.now();
  // Re-fetch uncommitted bodies after reconnect; commit only after IndexedDB oncomplete.
  for(const id of status.pending||[]){const record=await this.rpc('pending',{id});try{this.validateIncoming(record);}catch(error){this.receiveError=`Rejected invalid incoming message: ${error.message}`;await this.rpc('reject',{id,hash:record.hash});continue;}const previous=this.state.records.find(r=>r.meta.id===id);
   if(previous&&previous.meta.hash!==record.hash)throw new Error('Conflicting received record ID');
  if(!previous){const before=new Set(this.state.records.map(r=>r.meta.id));await this.change(state=>{this.ensureSpace(state,record.chat);state.records.push(this.makeRecord(record,state));if(record.chat)state.chatRevision=(state.chatRevision||0)+1;});if([...before].some(id=>!this.state.records.some(r=>r.meta.id===id)))await this.syncKnown(true);}
   await this.rpc('commit',{id,hash:record.hash});
  }
  for(const e of status.events||[]){
   if(e.event==='receipt'){
    await this.change(state=>{const r=state.records.find(r=>r.meta.id===e.id&&r.meta.hash===e.hash&&r.chat===!!e.chat);if(!r||!nodePattern.test(e.peer)||e.peer===status.node)return;const peer=status.peers.find(p=>p.id===e.peer);let receipt=r.meta.receipts.find(p=>p.id===e.peer),changed=!receipt;if(!receipt){receipt={id:e.peer,callsign:peer?.callsign||e.peer,human:false};r.meta.receipts.push(receipt);}if(e.human&&e.peer!==r.meta.origin&&!receipt.human){receipt.human=true;changed=true;}if(r.chat){if(r.meta.retrying)changed=true;r.meta.retrying=false;if(changed)state.chatRevision=(state.chatRevision||0)+1;}});
    const r=this.state.records.find(r=>r.meta.id===e.id);if(r&&(r.chat||this.complete(r))){await this.rpc('cancel',{id:e.id});this.inflight.delete(e.id);}
   }else if(e.event==='repair'){
    const r=this.state.records.find(r=>r.meta.id===e.id&&r.meta.hash===e.hash&&r.body&&r.meta.incident===status.incident);if(r)await this.publish(r,true);
   }else if(e.event==='sent'){
    this.inflight.delete(e.id);await this.change(state=>{const r=state.records.find(r=>r.meta.id===e.id);if(!r)return;r.attempts=Math.min((r.attempts||0)+1,6);r.due=this.now()+(r.chat?(r.attempts===1?15000:45000):r.attempts<=1?60000:r.attempts===2?300000:900000);r.meta.retrying=!!r.chat&&r.attempts<3&&!r.meta.receipts.some(p=>p.id!==status.node);if(r.chat)state.chatRevision=(state.chatRevision||0)+1;});
   }
   await this.rpc('eventsAck',{seq:e.seq});
  }
  await this.service();
 }
 complete(r){return deliveryStatus(r.meta,this.status.peers,this.status.node).complete;}
 async publish(r,repair=false,resend=false){const result=await this.rpc(resend?'resend':'publish',{id:r.meta.id,incident:r.meta.incident,origin:r.meta.origin,priority:r.meta.priority,hash:r.meta.hash,body:r.body,chat:r.chat,repair});if(result.queued&&!repair)this.inflight.set(r.meta.id,this.now());return result.queued;}
 async service(){if(!this.connected||!this.status.txEnabled||this.status.paused||!this.status.radioReady)return;for(const r of this.state.records){if(!r.body||r.meta.origin!==this.status.node||r.meta.incident!==this.status.incident||this.complete(r)||r.chat&&(!r.meta.retrying||r.attempts>=3)||this.now()<(r.due||0))continue;
   const queued=this.inflight.get(r.meta.id);if(queued!==undefined&&this.now()-queued<120000)continue;await this.publish(r);}
  for(const r of this.state.records)if(r.humanAckPending&&canHumanAcknowledge(r.meta,this.status)&&r.meta.incident===this.status.incident){await this.rpc('ack',{id:r.meta.id});await this.change(s=>{s.records.find(x=>x.meta.id===r.meta.id).humanAckPending=false;});}
 }
 async leaveRadio(){
  let next;try{next=await this.rpc('leave');}catch(error){if(/unknown operation/i.test(error.message))throw new Error('Update the radio firmware to leave or remove its active incident. Saved messages were not removed.');throw error;}
  if(next?.node!==this.status.node||next.incident!==ZERO||!Array.isArray(next.peers))throw new Error('Radio did not confirm leaving the incident. Saved messages were not removed.');
  this.status=next;this.inflight.clear();
 }
 ensureSpace(state,chat){if(chat){const chats=state.records.filter(r=>r.chat);if(chats.length>=96){const oldest=chats.filter(r=>!this.inflight.has(r.meta.id)&&(r.meta.origin!==this.status.node||r.meta.receipts.some(receipt=>receipt.id!==this.status.node))).sort((a,b)=>a.meta.order-b.meta.order)[0];if(!oldest)throw new Error('Chat storage busy: pending chat messages cannot be evicted');state.records=state.records.filter(r=>r!==oldest);state.chatRevision=(state.chatRevision||0)+1;}}if(state.records.length>=512)throw new Error('Message history full (512 records). Archive forms you want to keep, then remove an old incident to free message slots.');}
 validateIncoming(r){if(!idPattern.test(r.id)||!nodePattern.test(r.origin)||!nodePattern.test(r.incident)||r.incident===ZERO||typeof r.body!=='string'||utf8(r.body).length>(r.chat?768:4096)||crc32(r.body)!==r.hash)throw new Error('Invalid received record');const body=JSON.parse(r.body);if((!r.chat&&body.incident!==r.incident)||(r.chat&&body.incident!==undefined&&body.incident!==r.incident)||!callPattern.test(body.sender)||!Number.isSafeInteger(body.sentAt)||body.sentAt<0)throw new Error('Invalid received metadata');if(r.chat)this.validateChat(body);else{if(body.type!=='net-form-8'||body.priority!==r.priority)throw new Error('Invalid received form');validateForm(body);}}
 validateChat(b){if(b.type==='chat-message'){validateChatText(b.text);if(b.parent&&!idPattern.test(b.parent))throw new Error('Invalid chat reply');}else if(b.type==='chat-reaction'){if(!idPattern.test(b.target)||!chatEmojis.includes(b.emoji)||typeof b.active!=='boolean'||!Number.isInteger(b.sequence)||b.sequence<1||b.sequence>0xffffffff)throw new Error('Invalid reaction');}else throw new Error('Invalid chat type');}
 formMeta(record){const meta={...record.meta};if(record.body&&(meta.from===undefined||meta.to===undefined)){const b=JSON.parse(record.body);meta.from=b.from||'';meta.to=b.to||'';}return meta;}
 makeRecord(r,state){const b=JSON.parse(r.body),own=r.origin===this.status.node;return {body:r.body,chat:!!r.chat,attempts:0,due:0,meta:{id:r.id,incident:r.incident,origin:r.origin,hash:r.hash,priority:r.priority||0,sender:b.sender,recipient:b.recipient||'*',subject:b.subject||'',from:b.from||'',to:b.to||'',state:'stored',unread:!own&&!r.chat,order:++state.order,expected:own?this.status.peers.filter(p=>p.online&&p.incident===r.incident).map(p=>({id:p.id,callsign:p.callsign})):[],receipts:[{id:this.status.node,callsign:this.status.callsign,human:false}],retrying:own&&!!r.chat}};}
 readForm(id){const r=this.state.records.find(r=>r.meta.id===id&&!r.chat);if(!r)throw new Error('Form not found');return structuredClone({meta:this.formMeta(r),body:r.body});}
 async request(path,body){
  const url=new URL(path,'http://form8/'),route=url.pathname.replace(/^\/?(?:api\/)?/,'');const q=url.searchParams,post=body!==undefined;
  // Committed form bodies are immutable local snapshots. Reading one must not
  // wait behind Bluetooth polling, radio retries, or another IndexedDB write.
  if(!post&&route==='form'&&this.status&&this.state)return this.readForm(q.get('id'));
  return this.exclusive(async()=>{if(!this.status||!this.state)throw new Error('Choose a radio connection in Settings first');
  if(route==='status'){if(this.connected){await this.reconcile(await this.rpc('status'));if(this.now()-(this.state.lastStatusAt||0)>=60000)await this.rememberStatus();}const forms=this.state.records.filter(r=>!r.chat&&!!r.body),active=forms.filter(r=>r.meta.incident===this.status.incident),storage=await globalThis.navigator?.storage?.estimate?.();const station=structuredClone(this.status);if(!this.connected){station.gpsFresh=false;const elapsed=Math.max(0,this.now()-(this.statusAt||this.state.lastStatusAt||this.now()));if(station.location){station.location.ageMs+=elapsed;station.location.fresh=false;}for(const p of station.peers){if(Number.isFinite(p.lastHeardAgeMs))p.lastHeardAgeMs+=elapsed;if(p.location){p.location.ageMs+=elapsed;p.location.fresh=false;}}}return {...station,companionStorage:true,receiveError:this.receiveError,companionConnected:this.connected,radioReady:this.connected&&this.status.radioReady,peers:station.peers.map(p=>({...p,online:this.connected&&p.online})),storageUsed:storage?.usage||utf8(JSON.stringify(this.state)).length,storageTotal:storage?.quota||20*1048576,storageWarning:this.state.records.length>460||(storage?.usage>storage?.quota*0.9),unreadMessages:forms.filter(r=>r.meta.unread).length,outgoingMessages:active.filter(r=>r.meta.origin===this.status.node&&r.body&&!this.complete(r)).length};}
  if(route==='config'){if(!this.connected)throw new Error('Connect the radio to change settings');const s=await this.rpc('config',body);this.status=s;await this.rememberStatus();return s;}
  if(route==='time'||route==='position'){if(!this.connected)throw new Error('Radio disconnected');return this.rpc(route,body);}
  if(route==='nodes/forget'){
   if(!this.connected)throw new Error('Connect the radio to forget a node');
   if(!nodePattern.test(body?.id)||body.id===ZERO||body.id===this.status.node)throw new Error('Choose another valid node ID');
   let result;try{result=await this.rpc('forgetNode',{id:body.id});}catch(error){if(/unknown operation/i.test(error.message))throw new Error('Update the radio firmware and Android app together to forget nodes');throw error;}
   this.status.peers=this.status.peers.filter(peer=>peer.id!==body.id);await this.rememberStatus();return result;
  }
  if(route==='nodes/request-id'){
   if(!this.connected)throw new Error('Connect the radio to request a node ID');
   if(!nodePattern.test(body?.id)||body.id===ZERO||body.id===this.status.node)throw new Error('Choose another valid node ID');
   if(!this.status.radioReady||!this.status.txEnabled||this.status.paused||!callPattern.test(this.status.callsign||''))throw new Error('Set Radio transmission to On and save a callsign before requesting an ID');
   try{return await this.rpc('requestIdentity',{id:body.id});}catch(error){if(/unknown operation/i.test(error.message))throw new Error('Update the radio firmware and Android app together to request node IDs');throw error;}
  }
  if(route==='incident/announce'){if(!this.connected)throw new Error('Connect the radio to announce an incident');if(this.status.incident===ZERO)throw new Error('Join an incident before announcing it');if(!this.status.txEnabled||this.status.paused)throw new Error('Enable radio transmission and unpause before announcing');return this.rpc('announce',{});}
  if(route==='incident'){if(!this.connected)throw new Error('Connect the radio to select an incident');const id=body.id||token().slice(0,16),name=body.name?.trim();if(!nodePattern.test(id)||id===ZERO||!name||utf8(name).length>80)throw new Error('Incident name must be 1–80 UTF-8 bytes');await this.change(s=>{if(!s.incidents.some(i=>i.id===id))s.incidents.push({id,name});});const result=await this.rpc('incident',{id,name});this.status.incident=id;this.status.incidentName=name;await this.rememberStatus();this.inflight.clear();await this.syncKnown(true);return result;}
  if(route==='incident/leave'){
   if(!this.connected)throw new Error('Connect the radio to leave its incident');
   await this.leaveRadio();await this.rememberStatus();return {saved:true};
  }
  if(route==='incident/remove'){
   const id=body?.id;if(!nodePattern.test(id||'')||id===ZERO)throw new Error('Valid incident ID required');
   if(id===this.status.incident){if(!this.connected)throw new Error('Connect the radio before removing its active incident');await this.leaveRadio();}
   const removed=this.state.records.filter(r=>r.meta.incident===id),forms=removed.filter(r=>!r.chat).length;
   await this.change(s=>{s.records=s.records.filter(r=>r.meta.incident!==id);s.incidents=s.incidents.filter(i=>i.id!==id);if(removed.some(r=>r.chat))s.chatRevision=(s.chatRevision||0)+1;});
   for(const r of removed)this.inflight.delete(r.meta.id);
   if(this.connected)await this.syncKnown(true);await this.rememberStatus();return {saved:true,forms,chatEvents:removed.length-forms};
  }
  if(route==='incidents'){const incidents=new Map(this.state.incidents.map(i=>[i.id,i]));if(this.status.incident!==ZERO)incidents.set(this.status.incident,{id:this.status.incident,name:this.status.incidentName});for(const r of this.state.records){const b=r.body&&JSON.parse(r.body);if(!incidents.has(r.meta.incident))incidents.set(r.meta.incident,{id:r.meta.incident,name:b?.incidentName||r.meta.incident});}return {incidents:[...incidents.values()]};}
  if((route==='forms'||route==='chat')&&post)return this.submit(body,route==='chat');
  if(route==='forms'){const records=this.state.records.filter(r=>!r.chat&&(q.get('all')==='1'||r.meta.incident===this.status.incident)&&(q.get('history')==='1'||!!r.body)).sort((a,b)=>b.meta.order-a.meta.order);let offset=Math.max(0,Number(q.get('offset'))||0),i=records.findIndex(r=>r.meta.id===q.get('selected'));if(i>=0)offset=Math.floor(i/20)*20;return {forms:records.slice(offset,offset+20).map(r=>this.formMeta(r)),offset,total:records.length,previous:i>0?records[i-1].meta.id:null,next:i>=0&&i+1<records.length?records[i+1].meta.id:null};}
  if(route==='form')return this.readForm(q.get('id'));
  if(route==='chat'){const version=String(this.state.chatRevision||0);if(!q.has('before')&&q.get('since')===version)return {incident:this.status.incident,version,unchanged:true};const events=this.state.records.filter(r=>r.chat&&r.body&&r.meta.incident===this.status.incident).map(r=>({meta:{...r.meta,receipts:r.meta.receipts.filter(p=>p.id!==this.status.node)},body:JSON.parse(r.body)}));return {incident:this.status.incident,version,...chatTimelinePage(events,q.get('before')||'')};}
  if(route==='resend'){
   const r=this.state.records.find(r=>r.meta.id===body?.id&&!r.chat);
   if(!r?.body)throw new Error('Stored form body required to resend');
   if(r.meta.origin!==this.status.node)throw new Error('Only the originating station can resend a form');
   if(r.meta.incident!==this.status.incident||this.status.incident===ZERO)throw new Error("Join this form's incident before resending");
   if(!this.connected||!this.status.radioReady||!this.status.txEnabled||this.status.paused||!callPattern.test(this.status.callsign))throw new Error('Connect the radio and set Radio transmission to On before resending');
   let queued;try{queued=await this.publish(r,false,true);}catch(error){if(/Unknown operation/.test(error.message))throw new Error('Update the radio firmware and Android app together to use Resend');throw error;}
   if(!queued)throw new Error('Radio queue full; try resending shortly');
   return {id:r.meta.id,queued:true};
  }
  if(route==='read'||route==='ack'||route==='offload'){const r=this.state.records.find(r=>r.meta.id===body.id&&!r.chat);if(!r)throw new Error('Form not found');if(route==='ack'&&!canHumanAcknowledge(r.meta,this.status))throw new Error('The originating station cannot human-acknowledge its own form');if(route==='ack'&&r.meta.incident!==this.status.incident)throw new Error('Join the form incident first');
   if(route==='read')await this.change(s=>{s.records.find(x=>x.meta.id===body.id).meta.unread=false;});
   if(route==='ack'){await this.change(s=>{const row=s.records.find(x=>x.meta.id===body.id);row.meta.receipts.find(p=>p.id===this.status.node).human=true;row.humanAckPending=true;});if(this.connected){await this.rpc('ack',{id:body.id});await this.change(s=>{s.records.find(x=>x.meta.id===body.id).humanAckPending=false;});}}
   if(route==='offload'){if(body.mode!=='discard'&&(body.mode!=='archive'||!body.verified||body.hash!==r.meta.hash))throw new Error('Verified client archive required');await this.change(s=>{const row=s.records.find(x=>x.meta.id===body.id);row.meta=this.formMeta(row);delete row.body;row.meta.unread=false;row.meta.state=body.mode==='archive'?'archived':'discarded';});if(this.connected)await this.rpc('offload',{id:body.id});this.inflight.delete(body.id);}
   return {saved:true};
  }
  throw new Error('Unsupported companion API route');
 });}
 async submit(input,chat){if(this.status.incident===ZERO||!callPattern.test(this.status.callsign))throw new Error('Set callsign and join an incident first');const id=input.clientToken;if(!idPattern.test(id))throw new Error('Persistent submission token required');if((input.boundIncident||input.incident||this.status.incident)!==this.status.incident)throw new Error('Submission belongs to another incident');let existing=this.state.records.find(r=>r.meta.id===id);if(existing){if(existing.chat!==chat||existing.meta.incident!==this.status.incident||existing.meta.origin!==this.status.node)throw new Error('Submission token conflict');return {id,saved:true,existing:true};}
  const b={...input};delete b.clientToken;delete b.boundIncident;b.sender=this.status.callsign;b.incident=this.status.incident;b.incidentName=this.status.incidentName;b.sentAt=Math.floor(this.now()/1000);b.clockSource='phone/laptop';if(chat){if(b.type==='chat-reaction')b.sequence=(this.state.sequence+1)>>>0||1;this.validateChat(b);if(b.type==='chat-reaction'&&!this.state.records.some(r=>r.chat&&r.meta.id===b.target&&r.meta.incident===b.incident))throw new Error('Reaction target not found');}else{b.type='net-form-8';validateForm(b);}const wire=JSON.stringify(b);if(utf8(wire).length>(chat?768:4096))throw new Error('Serialized message too large');const r={id,incident:b.incident,origin:this.status.node,hash:crc32(wire),priority:chat?0:b.priority,body:wire,chat};await this.change(s=>{this.ensureSpace(s,chat);if(b.type==='chat-reaction')s.sequence=b.sequence;s.records.push(this.makeRecord(r,s));if(chat)s.chatRevision=(s.chatRevision||0)+1;});
  if(this.connected)await this.syncKnown(true);let queued=false;try{if(this.connected)queued=await this.publish(this.state.records.find(x=>x.meta.id===id));}catch{/* Durable save is authoritative; polling retries after reconnect. */}return {id,saved:true,queued};
 }
}
