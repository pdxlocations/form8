import {crc32,validateForm,validateChatText,chatEmojis,chatTimelinePage,resendExpectedStations} from './ui/model.js';
const incident='0000000000000008';
const copy=value=>structuredClone(value);
const stations=[
 {callsign:'BASE',role:'Command post',place:'Waterfront command post',lat:45.5175,lon:-122.6706},
 {callsign:'SHELTER',role:'Shelter station',place:'Peninsula Park shelter',lat:45.5698,lon:-122.6761},
 {callsign:'REPEATER',role:'Repeater',place:'Council Crest relay',lat:45.4995,lon:-122.7084}
];
const nodes=stations.map((station,i)=>({id:(i+1).toString(16).padStart(16,'0'),role:station.role,place:station.place,config:{callsign:station.callsign,primary:919.5,backup:0,bandwidth:500,sf:9,cr:8,power:20,useBackup:false,txEnabled:true,relayEnabled:i===2,paused:false,positionEnabled:true,positionInterval:600},incident,incidentName:'Portland exercise',incidents:[{id:incident,name:'Portland exercise'}],forms:{},chats:{},chatSequence:0,formSequence:0,queue:0,peers:[],location:{lat:station.lat,lon:station.lon,accuracy:10,source:'radio',capturedAt:Date.now()}}));
let channelFree=0;
function compatible(a,b){const x=a.config,y=b.config;return (x.useBackup?x.backup:x.primary)===(y.useBackup?y.backup:y.primary)&&['bandwidth','sf','cr'].every(k=>Number(x[k])===Number(y[k]));}
function peers(state){return nodes.filter(n=>n!==state&&compatible(state,n)&&!state.forgotten?.includes(n.id)).map(n=>({id:n.id,callsign:n.config.callsign,incident:n.incident,name:n.incidentName,online:true,lastHeardAgeMs:0,rssi:-75-Number(n.id)*3,snr:8,relayed:!direct(state,n),location:n.config.positionEnabled?{...n.location,fresh:true,ageMs:0}:undefined}));}
function log(message){document.dispatchEvent(new CustomEvent('radio-log',{detail:message}));}
function schedule(state,label,bytes,deliver){
 if(!state.config.txEnabled||state.config.paused)return false;
 const config=state.config;
 const airtime=Math.min(12000,Math.max(1000,(650+bytes*12)*2**(Number(config.sf)-9)*(500/Number(config.bandwidth))));
 const start=Math.max(Date.now()+350+Math.random()*450,channelFree),end=start+airtime;channelFree=end+350;state.queue++;
 log(`${config.callsign}: queued ${label} (${(airtime/1000).toFixed(1)}s airtime)`);
 setTimeout(()=>log(`${config.callsign}: transmitting ${label}`),start-Date.now());
 setTimeout(()=>{state.queue--;if(!state.config.txEnabled||state.config.paused){log(`${config.callsign}: transmission cancelled`);return;}deliver();log(`${config.callsign}: ${label} sent`);},end-Date.now());return true;
}
function recipients(state,record){return nodes.filter(n=>n!==state&&compatible(state,n)&&n.incident===record.meta.incident&&(!record.meta.recipient||record.meta.recipient==='*'||record.meta.recipient===n.config.callsign));}
// BASE and SHELTER are outside direct range; Council Crest bridges them.
function direct(a,b){return a===b||a===nodes[2]||b===nodes[2];}
function relayBetween(a,b){const relay=nodes[2];return !direct(a,b)&&relay.config.relayEnabled&&relay.config.txEnabled&&!relay.config.paused&&compatible(a,relay)&&compatible(relay,b)?relay:null;}
function routeReceipt(state,label,bytes,deliver){
 schedule(state,label,bytes,()=>{
   deliver(n=>direct(state,n)&&compatible(state,n));
   const relay=nodes[2];
   if(state!==relay&&relay.config.relayEnabled&&compatible(state,relay))schedule(relay,`relay ${label}`,bytes,()=>deliver(n=>compatible(relay,n)));
 });
}
function transmit(state,record,kind){
 const outgoing=copy(record);record.meta.expected=recipients(state,record).map(n=>({id:n.id,callsign:n.config.callsign}));record.meta.retrying=true;
 const receive=(target,relayed=false)=>{
   const collection=kind==='form'?target.forms:target.chats;
   if(!collection[outgoing.meta.id]){collection[outgoing.meta.id]=copy(outgoing);Object.assign(collection[outgoing.meta.id].meta,{unread:true,order:++target.formSequence,receipts:[],retrying:false,relayed});}
   log(`${target.config.callsign}: received ${kind} from ${state.config.callsign}${relayed?' via REPEATER':''}`);
   routeReceipt(target,'radio receipt',24,reachable=>{const receipt={id:target.id,callsign:target.config.callsign,human:false};for(const n of nodes.filter(reachable)){const r=(kind==='form'?n.forms:n.chats)[record.meta.id];if(r&&!r.meta.receipts.some(x=>x.id===target.id))r.meta.receipts.push(copy(receipt));}});
 };
 if(!schedule(state,kind,JSON.stringify(record).length,()=>{
   const targets=recipients(state,outgoing);
   for(const target of targets.filter(n=>direct(state,n)))receive(target);
   const distant=targets.filter(n=>relayBetween(state,n));
   if(distant.length){const relay=nodes[2];schedule(relay,`relay ${kind} from ${state.config.callsign}`,JSON.stringify(record).length,()=>{for(const target of distant)if(relayBetween(state,target)&&target.incident===outgoing.meta.incident&&compatible(state,target))receive(target,true);record.meta.retrying=false;});}
   else record.meta.retrying=false;
 }))record.meta.retrying=false;
}
function acknowledge(state,record){routeReceipt(state,'human acknowledgement',40,reachable=>{for(const n of nodes.filter(reachable)){const r=n.forms[record.meta.id];if(!r)continue;const receipt=r.meta.receipts.find(x=>x.id===state.id);if(receipt)receipt.human=true;else r.meta.receipts.push({id:state.id,callsign:state.config.callsign,human:true});}});}
function seedDemo(){
 const now=Math.floor(Date.now()/1000);
 const receipts=nodes.map(n=>({id:n.id,callsign:n.config.callsign,human:n===nodes[1]}));
 const forms=[
  {origin:0,subject:'Shelter supply request',to:'Shelter lead',from:'Command post · Logistics',priority:1,message:'EXERCISE ONLY: Confirm the number of cots and water cases needed at Peninsula Park. Send a linked reply with your current headcount.',recipient:'*',location:{lat:nodes[0].location.lat,lon:nodes[0].location.lon}},
  {origin:1,subject:'Shelter status report',to:'Command post',from:'Shelter lead',priority:0,message:'EXERCISE ONLY: Shelter is open. 24 people checked in. Water and first-aid supplies are available. Request 12 additional cots before the next shift.',recipient:'*',location:{lat:nodes[1].location.lat,lon:nodes[1].location.lon}}
 ];
 forms.forEach((form,i)=>{const id=(0xd001+i).toString(16).padStart(32,'0'),origin=nodes[form.origin];const {origin:unused,...fields}=form;const body=JSON.stringify({...fields,sender:origin.config.callsign,incident,incidentName:'Portland exercise',sentAt:now-900+i*240,clockSource:'phone/laptop'});for(const node of nodes)node.forms[id]={body,meta:{id,incident,origin:origin.id,order:++node.formSequence,hash:crc32(body),priority:form.priority,state:'stored',recipient:form.recipient,subject:form.subject,sender:origin.config.callsign,expected:nodes.filter(n=>n!==origin).map(n=>({id:n.id,callsign:n.config.callsign})),receipts:copy(receipts),unread:node!==origin,relayed:!direct(origin,node)}};});
 const chats=[{origin:0,text:'EXERCISE: Radio check. Shelter, please confirm you can hear command.'},{origin:2,text:'Council Crest repeater online. Forwarding traffic between BASE and SHELTER.'},{origin:1,text:'Shelter copies. 24 people checked in; supply report sent.'}];
 chats.forEach((chat,i)=>{const id=(0xc001+i).toString(16).padStart(32,'0'),origin=nodes[chat.origin];for(const node of nodes)node.chats[id]={body:{type:'chat-message',text:chat.text,sender:origin.config.callsign,sentAt:now-600+i*120},meta:{id,incident,origin:origin.id,order:++node.formSequence,attempts:1,retrying:false,receipts:copy(receipts)}};});
}
seedDemo();
function announce(state){schedule(state,'incident announcement',80,()=>{for(const n of nodes.filter(n=>n!==state&&compatible(state,n))){n.forgotten=(n.forgotten||[]).filter(id=>id!==state.id);n.peers=peers(n);}});}
export const simulator={nodes,async request(index,path,body){
 const state=nodes[index];if(!state)throw Error('Unknown node');
 const url=new URL('/api/'+path,'https://simulator.invalid');const req={method:body===undefined?'GET':'POST'};const d=copy(body||{});let output={saved:true},code=200;
 const oldForms=new Set(Object.keys(state.forms)),oldChats=new Set(Object.keys(state.chats));
    switch(`${req.method} ${url.pathname}`){
      case 'GET /api/status':output={...state.config,gpsAvailable:false,gpsFresh:false,location:state.location?{...state.location,ageMs:Date.now()-state.location.capturedAt,fresh:Date.now()-state.location.capturedAt<=120000}:{},powerMin:2,powerMax:22,powerIsDrive:false,simulated:true,board:'SIMULATOR · no RF',node:state.id,incident:state.incident,incidentName:state.incidentName,frequency:state.config.useBackup?state.config.backup:state.config.primary,queue:state.queue,dropped:0,clockSource:'phone/laptop',fsReady:true,radioReady:true,radioError:0,storageUsed:JSON.stringify(state).length,storageTotal:4128768,storageWarning:false,freeHeap:200000,band:'uhf',peers:peers(state)};break;
      case 'POST /api/config':if(d.relayEnabled!==undefined&&typeof d.relayEnabled!=='boolean')throw Error('Invalid relay setting');if(d.power!==undefined&&(!Number.isInteger(d.power)||d.power<2||d.power>22))throw Error('TX power must be a whole number from 2 to 22 dBm');if(d.positionInterval!==undefined&&(!Number.isInteger(d.positionInterval)||d.positionInterval<60||d.positionInterval>86400))throw Error('Position interval must be 60–86400 whole seconds');if(d.positionEnabled!==undefined&&typeof d.positionEnabled!=='boolean')throw Error('Invalid position sharing setting');state.config={...state.config,...d};output.radioReady=true;break;
      case 'POST /api/position':{
        if(!Number.isFinite(d.lat)||!Number.isFinite(d.lon)||Math.abs(d.lat)>90||Math.abs(d.lon)>180||!Number.isInteger(d.ageMs)||d.ageMs<0||d.ageMs>120000)throw Error('Invalid or stale position');
        if(d.accuracy!==undefined&&(!Number.isFinite(d.accuracy)||d.accuracy<0||d.accuracy>65534))throw Error('Invalid accuracy');
        state.location={lat:d.lat,lon:d.lon,accuracy:d.accuracy??-1,source:'phone',capturedAt:Date.now()-d.ageMs};break;
      }
      case 'POST /api/time':break;
      case 'GET /api/incidents':output={incidents:state.incidents};break;
      case 'GET /api/chat':output={incident:state.incident,...chatTimelinePage(Object.values(state.chats).filter(event=>event.meta.incident===state.incident),url.searchParams.get('before')||'')};break;
      case 'POST /api/chat':{
        if(state.incident==='0000000000000000'||d.incident!==state.incident)throw Error('Join the matching incident first');
        const id=d.clientToken;if(!/^[a-f0-9]{32}$/.test(id)||/^0+$/.test(id))throw Error('Invalid chat token');
        if(state.forms[id])throw Error('Token belongs to a form');
        if(state.chats[id]){
          if(state.chats[id].meta.incident!==state.incident)throw Error('Token belongs to another incident');
          output={id,existing:true};break;
        }
        const body={type:d.type,sender:state.config.callsign,sentAt:Math.floor(Date.now()/1000)};
        if(d.type==='chat-message'){
          body.text=validateChatText(d.text);
          if(d.parent){if(!/^[a-f0-9]{32}$/.test(d.parent)||/^0+$/.test(d.parent))throw Error('Invalid reply ID');body.parent=d.parent;}
        }else if(d.type==='chat-reaction'){
          const target=state.chats[d.target];if(!target||target.meta.incident!==state.incident||target.body.type!=='chat-message')throw Error('Reaction target unavailable');
          if(!chatEmojis.includes(d.emoji)||typeof d.active!=='boolean')throw Error('Invalid reaction');
          Object.assign(body,{target:d.target,emoji:d.emoji,active:d.active,sequence:++state.chatSequence});
        }else throw Error('Invalid chat type');
        const order=Math.max(0,...Object.values(state.chats).map(event=>event.meta.order))+1;
        state.chats[id]={body,meta:{id,incident:state.incident,origin:state.id,order,attempts:0,retrying:false,receipts:[]}};
        const history=Object.values(state.chats).sort((a,b)=>a.meta.order-b.meta.order);
        for(const event of history.slice(0,Math.max(0,history.length-96)))delete state.chats[event.meta.id];
        output={id,saved:true};code=201;break;
      }
      case 'POST /api/nodes/forget':if(!/^[a-f0-9]{16}$/.test(d.id||'')||/^0+$/.test(d.id)||d.id===state.id)throw Error('Choose another valid node ID');output={saved:true,removed:(state.peers||[]).some(peer=>peer.id===d.id)};state.forgotten??=[];state.forgotten.push(d.id);break;
      case 'POST /api/nodes/request-id':if(!/^[a-f0-9]{16}$/.test(d.id||'')||/^0+$/.test(d.id)||d.id===state.id)throw Error('Choose another valid node ID');if(!state.config.txEnabled||state.config.paused)throw Error('Set Radio transmission to On before requesting an ID');output={queued:true};break;
      case 'POST /api/incident/announce':if(state.incident==='0000000000000000')throw Error('Join an incident before announcing it');if(!state.config.txEnabled||state.config.paused)throw Error('Enable radio transmission and unpause before announcing');output={queued:true};break;
      case 'POST /api/incident':{
        state.incident=d.id||crypto.randomUUID().replaceAll("-", "").slice(0,16);state.incidentName=d.name;
        if(!state.incidents.some(i=>i.id===state.incident))state.incidents.push({id:state.incident,name:d.name});output={id:state.incident};break;
      }
      case 'POST /api/incident/leave':state.incident='0000000000000000';state.incidentName='';break;
      case 'POST /api/incident/remove':{
        if(!/^[a-f0-9]{16}$/.test(d.id||'')||/^0+$/.test(d.id))throw Error('Valid incident ID required');
        if(state.incident===d.id){state.incident='0000000000000000';state.incidentName='';}
        const forms=Object.values(state.forms).filter(r=>r.meta.incident===d.id).length;
        const chats=Object.values(state.chats).filter(r=>r.meta.incident===d.id).length;
        state.forms=Object.fromEntries(Object.entries(state.forms).filter(([,r])=>r.meta.incident!==d.id));
        state.chats=Object.fromEntries(Object.entries(state.chats).filter(([,r])=>r.meta.incident!==d.id));
        state.incidents=state.incidents.filter(i=>i.id!==d.id);output={saved:true,forms,chatEvents:chats};break;
      }
      case 'GET /api/forms':{
        const forms=Object.values(state.forms).map(f=>f.meta).filter(m=>(url.searchParams.get('all')==='1'||m.incident===state.incident)&&(url.searchParams.get('history')==='1'||m.state==='stored')).sort((a,b)=>(b.order||0)-(a.order||0)||(b.trafficSentAt||0)-(a.trafficSentAt||0)||(b.receivedOrder||0)-(a.receivedOrder||0)||a.id.localeCompare(b.id));
        const index=forms.findIndex(m=>m.id===url.searchParams.get('selected'));
        const offset=index>=0?Math.floor(index/20)*20:Number(url.searchParams.get('offset')||0);
        output={forms:forms.slice(offset,offset+20),total:forms.length,offset,previous:index>0?forms[index-1].id:null,next:index>=0&&index+1<forms.length?forms[index+1].id:null};break;
      }
      case 'GET /api/form':output=state.forms[url.searchParams.get('id')];if(!output){throw Error('Form not found');}break;
      case 'POST /api/forms':{
        if(state.incident==='0000000000000000')throw Error('Join an incident first');
        if(d.boundIncident && d.boundIncident!==state.incident)throw Error('Draft belongs to another incident');
        const id=d.clientToken;if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid submission token');
        if(state.chats[id])throw Error('Token belongs to chat');
        if(!state.forms[id]){
          delete d.clientToken;validateForm(d);d.sender=state.config.callsign;d.incident=state.incident;d.incidentName=state.incidentName;d.clockSource='phone/laptop';d.sentAt=Math.floor(Date.now()/1000);
          const body=JSON.stringify(d);state.forms[id]={body,meta:{id,incident:state.incident,origin:state.id,order:++state.formSequence,hash:crc32(body),priority:d.priority,state:'stored',recipient:d.recipient,subject:d.subject,sender:d.sender,expected:[],receipts:[{id:state.id,human:false}]}};
        }output={id,saved:true,queued:state.config.txEnabled&&!state.config.paused};code=201;break;
      }
      case 'POST /api/resend':{const record=state.forms[d.id];if(!record?.body)throw Error('Stored form body required to resend');if(record.meta.origin!==state.id)throw Error('Only the originating station can resend a form');if(record.meta.incident!==state.incident)throw Error("Join this form's incident before resending");if(!state.config.txEnabled||state.config.paused)throw Error('Set Radio transmission to On before resending');record.meta.expected=resendExpectedStations(record.meta,{node:state.id,peers:peers(state)});output={id:d.id,queued:true};break;}
      case 'POST /api/ack':{
        const record=state.forms[d.id];if(!record?.body)throw Error('Stored form required');if(record.meta.origin===state.id)throw Error('The originating station cannot human-acknowledge its own form');acknowledge(state,record);break;
      }
      case 'POST /api/read':{
        const record=state.forms[d.id];if(!record)throw Error('Unknown form');record.meta.unread=false;break;
      }
      case 'POST /api/offload':{
        const record=state.forms[d.id];if(!record)throw Error('Unknown form');
        if(d.mode==='archive'&&(!d.verified||d.hash!==record.meta.hash))throw Error('Verified archive required');
        if(!['archive','discard'].includes(d.mode))throw Error('Invalid mode');record.meta.state=d.mode==='archive'?'archived':'discarded';record.meta.unread=false;delete record.body;break;
      }
      default:throw Error('Unknown API route');
    }

 if(req.method==='POST'){
  if(url.pathname==='/api/forms'&&!oldForms.has(output.id))transmit(state,state.forms[output.id],'form');
  if(url.pathname==='/api/chat'&&!oldChats.has(output.id))transmit(state,state.chats[output.id],'chat');
  if(url.pathname==='/api/resend')transmit(state,state.forms[d.id],'form');
  if(['/api/incident','/api/incident/announce'].includes(url.pathname))announce(state);
 }
 if(url.pathname==='/api/status')Object.assign(output,{gpsAvailable:true,gpsFresh:true,location:{...state.location,fresh:true,ageMs:0},unreadMessages:Object.values(state.forms).filter(r=>r.meta.unread).length,outgoingMessages:Object.values(state.forms).filter(r=>r.meta.retrying).length});
 return copy(output);
}};
