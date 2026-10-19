import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {priorities,manualAcknowledgments, receiptRows, deliveryStatus, formDeliverySummary, canReplyToForm, canHumanAcknowledge, canResendForm} from '../web/model.js';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function descendants(element){return (element.children||[]).flatMap(child=>[child,...descendants(child)]);}
function harness(){
  const elements=new Map(),calls=[];
  function element(){return {hidden:true,children:[],elements:new Proxy({}, {get:(target,key)=>target[key]??=( {value:'',checked:false})}),replaceChildren(...items){this.children=[...items];},append(...items){this.children.push(...items);},setAttribute(){},dataset:{},classList:{toggle(){}}};}
  const $=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);};
  let next={node:'radio1',bootSession:1,callsign:'TEST2',frequency:919.5,peers:[],incident:'42',incidentName:'Test',storageUsed:0,storageTotal:1048576,queue:0,fsReady:true,radioReady:true,txEnabled:true,band:'uhf',board:'Heltec',clockSource:'unset',power:14};
  let record={meta:{id:'abc',state:'stored',subject:'Hello'},body:JSON.stringify({message:'New message'})};
  const context=vm.createContext({workspaceEpoch:0,workspaceNode:'radio1',persistWorkspaceView:async()=>{},priorities,trackActionControl(){},document:{querySelectorAll(){return [];}},updateNavigationBadges(){},positionClient:{update(){}},canReplyToForm,canHumanAcknowledge,canResendForm,mapPanel:{update(){}},$,api:async path=>{calls.push(path);if(path==='status')return next;if(path.startsWith('form?'))return record;if(path==='incidents')return {incidents:[{id:'42',name:'Test'}]};throw Error(path);},text:(tag,value,className)=>({...element(),tag,value,className}),button:(label,onclick)=>({label,textContent:label,onclick,dataset:{}}),run:fn=>fn,refreshFormFeedback(){},feedback:message=>calls.push(message),renderReceipts:()=>calls.push('receipts'),loadTraffic:async()=>{calls.push('traffic');if(vm.runInContext('selectedForm && openRecord',context))context.renderForm({...record,body:record.meta.state==='stored'?record.body:undefined});},loadChatMessages:async()=>calls.push('chat'),chatControls(){},resetChat(){calls.push('chat-reset');},joinIncident(){}});
  const originalApi=context.api;context.api=async(path,body)=>path==='time'?(calls.push({path,body}),{saved:true}):originalApi(path,body);
  vm.runInContext("let incidentTransition=null;let retainedIncidents={node:'',incidents:[]};let timeSyncTarget='',timeSynced=false,timeSyncRetryAt=0;const resendingForms=new Set();const identityRequests=new Map();const forgettingNodes=new Set();const deletingIncidents=new Set();let messageNeighbors={previous:null,next:null};let status=null,polling=null,settingsLoaded=false,settingsDirty=false,selectedForm=null,displayedRecord='',openRecord=null,openingForm=null,offset=0;"+source.slice(source.indexOf('function renderNodes()'),source.indexOf('function poll()'))+source.slice(source.indexOf('function poll()'),source.indexOf("window.addEventListener('form8-connection-change'"))+source.slice(source.indexOf('function radioClockKey'),source.indexOf('function renderReceipts'))+source.slice(source.indexOf('function renderForm('),source.indexOf('async function refreshData'))+source.slice(source.indexOf('async function loadRetainedIncidents'),source.indexOf('async function loadArchives')),context);
  context.switchWorkspace=async node=>{context.workspaceNode=node;};
  return {$,calls,context,update:value=>{next={...next,...value};},setRecord:value=>{record=value;},poll:()=>vm.runInContext('poll()',context)};
}

test('incoming status refreshes counts, visible traffic, incident membership and retained incidents',async()=>{
  const h=harness();h.$('#traffic').hidden=false;h.$('#incidents').hidden=false;
  await h.poll();assert.match(h.$('#station').textContent,/0 nearby incident nodes/);
  h.update({unreadMessages:1,outgoingMessages:2,queue:3,clockSource:'phone/laptop',peers:[{online:true,incident:'42',name:'Test'},{online:true,incident:'99',name:'Other'}]});
  await h.poll();assert.match(h.$('#station').textContent,/1 nearby incident nodes · 2 nodes heard/);
  assert.equal(h.$('#message-status').textContent,'1 unread · 2 awaiting radio ACK');
  assert.equal(h.$('#queue').textContent,'3 queue items');assert.match(h.$('#board-info').textContent,/phone\/laptop/);
  assert.equal(h.$('#nearby').children.length,2);assert.equal(h.$('#retained').children.length,1);
  assert.equal(h.calls.filter(c=>c==='traffic').length,2);
  h.update({peers:[]});await h.poll();assert.match(h.$('#nearby').children[0].value,/No nearby incidents/);
});

test('open form refreshes body/state without marking other incoming forms read',async()=>{
  const h=harness();h.$('#traffic').hidden=false;vm.runInContext("selectedForm='abc'",h.context);
  await h.poll();
  assert.ok(descendants(h.$('#form-detail')).some(e=>e.value==='New message'));
  h.setRecord({meta:{id:'abc',state:'offloaded',subject:'Hello'}});await h.poll();
  assert.ok(h.$('#form-detail').children.some(e=>e.value?.includes('removed locally')));
  assert.ok(!h.calls.includes('read'));
});

test('refresh preserves unsaved settings and clears open message on incident switch',async()=>{
  const h=harness();await h.poll();h.$('#radio-settings').elements.callsign.value='EDITING';
  vm.runInContext("settingsDirty=true;selectedForm='abc';offset=20",h.context);
  h.update({incident:'99',incidentName:'Other',callsign:'REMOTE'});await h.poll();
  assert.equal(h.$('#radio-settings').elements.callsign.value,'EDITING');
  assert.equal(vm.runInContext('selectedForm',h.context),null);assert.equal(vm.runInContext('offset',h.context),0);
  assert.equal(h.$('#active-name').textContent,'Other');assert.equal(h.$('#form-detail').hidden,true);
});

test('concurrent refresh callers await the same update',async()=>{
  const h=harness();const a=h.poll(),b=h.poll();assert.equal(a,b);await Promise.all([a,b]);
  assert.equal(h.calls.filter(c=>c==='status').length,1);
});

test('chat loads for a new incident without waiting for the prior incident request',async()=>{
  const h=harness(),source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8'),loads=[];
  h.context.refreshChatMessages=()=>new Promise(resolve=>loads.push({incident:vm.runInContext('status.incident',h.context),resolve}));
  vm.runInContext("status={node:'radio',incident:'old'};"+source.slice(source.indexOf('const chatLoading=new Map();'),source.indexOf('async function refreshChatMessages()')),h.context);
  const oldLoad=vm.runInContext('loadChatMessages()',h.context);vm.runInContext("status.incident='new'",h.context);
  const newLoad=vm.runInContext('loadChatMessages()',h.context);
  assert.deepEqual(loads.map(load=>load.incident),['old','new']);
  loads[1].resolve();loads[0].resolve();await Promise.all([oldLoad,newLoad]);
});

test('time sync runs on first connection, reconnection, radio switch and reboot, not every poll',async()=>{
  const h=harness(),syncs=()=>h.calls.filter(call=>call?.path==='time');
  await h.poll();assert.equal(syncs().length,1);
  assert.ok(Math.abs(syncs()[0].body.epoch-Math.floor(Date.now()/1000))<=1);
  assert.match(h.$('#board-info').textContent,/phone\/laptop/);
  await h.poll();await h.poll();assert.equal(syncs().length,1);
  h.update({node:'radio2'});await h.poll();assert.equal(syncs().length,2);
  h.update({bootSession:2});await h.poll();assert.equal(syncs().length,3);
  const original=h.context.api;
  h.context.api=async path=>{if(path==='status')throw Error('Disconnected');return original(path);};
  assert.equal(await h.poll(),false);
  h.context.api=original;await h.poll();assert.equal(syncs().length,4);
  h.update({clockSource:'unsynchronized'});await h.poll();assert.equal(syncs().length,5);
});

test('failed time sync keeps the radio connected and retries after ten seconds',async()=>{
  const h=harness();let now=1800000000000,attempts=0;
  h.context.feedback=message=>{h.$('#feedback').textContent=message;h.$('#feedback').hidden=false;};
  h.context.Date=class extends Date {static now(){return now;}};
  const original=h.context.api;
  h.context.api=async(path,body)=>{
    if(path==='time' && ++attempts===1)throw Error('Temporary time API failure');
    return original(path,body);
  };
  assert.equal(await h.poll(),true);assert.equal(attempts,1);
  assert.equal(h.$('#feedback').hidden,false);
  assert.match(h.$('#connection').textContent,/Connected/);
  now+=9999;await h.poll();assert.equal(attempts,1);
  now+=1;await h.poll();assert.equal(attempts,2);assert.match(h.$('#board-info').textContent,/phone\/laptop/);
  assert.equal(h.$('#feedback').hidden,true);
  await h.poll();assert.equal(attempts,2);
});

test('visible chat refreshes with status and incident changes clear chat while form counts stay separate',async()=>{
  const h=harness();h.$('#chat').hidden=false;
  h.update({unreadMessages:2,outgoingMessages:1});await h.poll();
  assert.ok(h.calls.includes('chat'));assert.equal(h.$('#message-status').textContent,'2 unread · 1 awaiting radio ACK');
  h.update({incident:'99'});await h.poll();assert.ok(h.calls.includes('chat-reset'));
});

test('every tab has a refresh button that updates data without navigation or resetting edits',async()=>{
  const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
  for(const tab of ['compose','traffic','chat','incidents','map','archive','settings'])assert.ok(html.includes(`data-refresh="${tab}"`));
  const h=harness();
  h.context.draftList=async()=>h.calls.push('drafts');h.context.loadArchives=async()=>h.calls.push('archives');
  vm.runInContext(source.slice(source.indexOf('async function refreshData'),source.indexOf('for(const refresh of')),h.context);
  h.$('#incidents').hidden=false;
  await vm.runInContext("refreshData('incidents')",h.context);
  assert.equal(h.$('#incidents').hidden,false);assert.equal(h.$('#compose').hidden,true);
  h.$('#radio-settings').elements.callsign.value='UNSAVED';vm.runInContext('settingsDirty=true',h.context);
  await vm.runInContext("refreshData('settings')",h.context);
  assert.equal(h.$('#radio-settings').elements.callsign.value,'UNSAVED');
  await vm.runInContext("refreshData('compose')",h.context);assert.ok(h.calls.includes('drafts'));
  await vm.runInContext("refreshData('archive')",h.context);assert.ok(h.calls.includes('archives'));
});

test('message reader hides the list, navigates across pages, and Back restores its page',async()=>{
  const h=harness();h.$('#traffic').hidden=false;
  const forms=Array.from({length:21},(_,i)=>({id:String(i).padStart(32,'0'),subject:`Message ${i}`,sender:'TEST1',recipient:'*',priority:0,state:'stored'}));
  h.context.api=async(path)=>{
    h.calls.push(path);
    const url=new URL(path,'http://radio/');
    if(url.pathname==='/forms'){
      const index=forms.findIndex(m=>m.id===url.searchParams.get('selected'));
      const offset=index>=0?Math.floor(index/20)*20:Number(url.searchParams.get('offset'));
      return {forms:forms.slice(offset,offset+20),total:forms.length,offset,previous:index>0?forms[index-1].id:null,next:index>=0&&index<forms.length-1?forms[index+1].id:null};
    }
    if(url.pathname==='/form')return {meta:forms.find(m=>m.id===url.searchParams.get('id')),body:JSON.stringify({message:'Test body'})};
    if(path==='read')return {saved:true};
    throw Error(path);
  };
  h.context.priorities=['Routine'];h.context.deliveryStatus=()=>({complete:false,label:'Awaiting radio ACK'});
  vm.runInContext('let total=0;'+source.slice(source.indexOf('async function loadTraffic()'),source.indexOf('function renderForm(')),h.context);
  // Exercise actual list/reader refresh logic, without unrelated status fields.
  h.context.poll=async()=>{await vm.runInContext('loadTraffic()',h.context);return true;};
  await vm.runInContext(`openForm('${forms[19].id}')`,h.context);
  assert.equal(h.$('#traffic-overview').hidden,true);assert.equal(h.$('#message-reader').hidden,false);
  assert.equal(h.$('#previous-message').hidden,false);assert.equal(h.$('#next-message').hidden,false);
  assert.ok(!h.$('#traffic-list').children[0].children.some(e=>e.className==='delivery'));
  await h.$('#next-message').onclick();
  assert.equal(vm.runInContext('selectedForm',h.context),forms[20].id);assert.equal(vm.runInContext('offset',h.context),20);
  assert.equal(h.$('#next-message').hidden,true);assert.equal(h.$('#previous-message').hidden,false);
  await h.$('#message-back').onclick();
  assert.equal(h.$('#traffic-overview').hidden,false);assert.equal(h.$('#message-reader').hidden,true);
  assert.equal(vm.runInContext('offset',h.context),20);assert.equal(h.$('#traffic-list').children.length,1);
  await vm.runInContext(`openForm('${forms[0].id}')`,h.context);
  assert.equal(h.$('#previous-message').hidden,true);assert.equal(h.$('#next-message').hidden,false);
  forms.splice(1);await vm.runInContext('loadTraffic()',h.context);
  assert.equal(h.$('#previous-message').hidden,true);assert.equal(h.$('#next-message').hidden,true);
});

test('acknowledge button reflects this node’s saved human acknowledgment',async()=>{
  const h=harness();vm.runInContext("status={node:'self'};selectedForm='abc'",h.context);
  const render=receipts=>{
    h.context.record={meta:{id:'abc',origin:'remote',receipts},body:JSON.stringify({message:'Test'})};
    vm.runInContext('renderForm(record)',h.context);
    return h.$('#form-detail').children.find(e=>e.children?.some(c=>c.label==='Acknowledge'||c.label==='Acknowledged')).children[0];
  };
  let button=render([{id:'other',human:true},{id:'self',human:false}]);
  assert.equal(button.textContent,'Acknowledge');assert.equal(button.disabled,false);
  h.context.api=async()=>({saved:true});h.context.poll=async()=>true;
  await button.onclick();assert.equal(button.textContent,'Acknowledged');assert.equal(button.disabled,true);
  button=render([{id:'self',human:true}]);assert.equal(button.textContent,'Acknowledged');assert.equal(button.disabled,true);
  button=render([{id:'self',human:false}]);h.context.api=async()=>{throw Error('Cannot save');};
  await assert.rejects(button.onclick(),/Cannot save/);assert.equal(button.textContent,'Acknowledge');assert.equal(button.disabled,false);
});

test('receipt matrix replaces duplicate boxes and includes every human ACK with distinct colors',()=>{
  const h=harness();h.context.receiptRows=receiptRows;h.context.document={createElement:tag=>h.context.text(tag,'')};
  vm.runInContext("status={node:'self',callsign:'NET-A',peers:[{id:'b',callsign:'NET-B',online:true},{id:'waiting',callsign:'NET-W',online:true}]};"+source.slice(source.indexOf('function renderReceipts('),source.indexOf('async function loadTraffic()')),h.context);
  h.context.meta={origin:'origin',sender:'NET-O',expected:[{id:'waiting'},{id:'offline'}],receipts:[{id:'self',human:true},{id:'b',human:true},{id:'c',human:false}]};
  vm.runInContext('renderReceipts(meta)',h.context);
  const rows=()=>h.$('#delivery-detail').children[0].children.slice(1);
  assert.equal(h.$('#delivery-detail').children.length,1);
  assert(rows().some(r=>r.children[0].value==='NET-A'&&r.children[2].className==='receipt-human'));
  assert(rows().some(r=>r.children[0].value==='NET-B'&&r.children[2].value==='Acknowledged'));
  assert(rows().some(r=>r.children[1].className==='receipt-origin'));
  assert(rows().some(r=>r.children[1].className==='receipt-radio'));
  assert(rows().some(r=>r.children[1].className==='receipt-pending'));
  assert(rows().some(r=>r.children[1].className==='receipt-offline'));
  h.context.meta.receipts.push({id:'offline',callsign:'NET-C',human:true});vm.runInContext('renderReceipts(meta)',h.context);
  assert(rows().some(r=>r.children[0].value==='NET-C'&&r.children[2].value==='Acknowledged'));
});

test('TX power range comes from the board and refreshes without overwriting an edit',async()=>{
  const h=harness();h.update({powerMin:2,powerMax:22,powerIsDrive:false,power:22});await h.poll();
  const power=h.$('#radio-settings').elements.power;
  assert.equal(power.max,22);assert.equal(power.min,2);assert.equal(power.value,'22');
  assert.equal(h.$('#tx-power-label').textContent,'TX power · dBm (2–22)');assert.equal(h.$('#tx-power-help').hidden,true);
  power.value='18';vm.runInContext('settingsDirty=true',h.context);
  h.update({powerMax:20});await h.poll();assert.equal(power.max,20);assert.equal(power.value,'18');
  h.update({powerMax:22,powerIsDrive:true});await h.poll();
  assert.equal(h.$('#tx-power-label').textContent,'TX chip drive · dBm (2–22)');assert.equal(h.$('#tx-power-help').hidden,false);assert.match(h.$('#tx-power-help').textContent,/not final antenna output/);
  h.update({powerMax:10,band:'vhf'});await h.poll();assert.equal(power.max,10);
});

test('traffic shows a radio ACK immediately while keeping directed recipient delivery distinct',async()=>{
 const h=harness();await h.poll();
 const meta={id:'abc',origin:'radio1',recipient:'NET-DEST',subject:'ACK test',priority:0,state:'stored',expected:[{id:'relay',callsign:'NET-RELAY'},{id:'dest',callsign:'NET-DEST'}],receipts:[{id:'radio1'}]};
 h.context.api=async()=>({forms:[meta],total:1,offset:0});h.context.deliveryStatus=deliveryStatus;
 vm.runInContext('let total=0;'+source.slice(source.indexOf('async function loadTraffic()'),source.indexOf('function renderForm(')),h.context);
 const receipt=()=>h.$('#traffic-list').children[0].children[1];
 await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Pending ACK');
 meta.receipts.push({id:'relay'});await vm.runInContext('loadTraffic()',h.context);
 assert.equal(receipt().value,'Radio ACK · recipient pending');assert.match(receipt().title,/NET-RELAY.*NET-DEST/);
 meta.receipts.push({id:'dest',human:true});await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Human ACK: NET-DEST');
 meta.recipient='*';meta.receipts.pop();await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Radio ACK');
});

test('sent message info bar refreshes ACKs after returning to the list without replacing unrelated feedback',async()=>{
 const h=harness();h.context.formDeliverySummary=formDeliverySummary;h.context.formSendStatus=()=>{};vm.runInContext('let formSubmitting=false;',h.context);
 vm.runInContext(source.slice(source.indexOf('function feedback('),source.indexOf('function run(')),h.context);
 h.context.meta={id:'abc',recipient:'*',receipts:[]};
 vm.runInContext("status={node:'radio1',txEnabled:true,peers:[]};feedback('Saved · awaiting radio ACK');",h.context);
 h.$('#feedback').dataset.form='radio1/abc';
 h.setRecord({meta:{id:'abc',receipts:[{id:'b',callsign:'NET-B'}]}});
 await h.poll();assert.match(h.$('#feedback').textContent,/Radio Ack: NET-B/);assert.doesNotMatch(h.$('#feedback').textContent,/awaiting/i);
 h.setRecord({meta:{id:'abc',receipts:[{id:'b',callsign:'NET-B',human:true}]}});
 await h.poll();assert.match(h.$('#feedback').textContent,/Human Ack: NET-B/);
 vm.runInContext("feedback('New error',true)",h.context);
 await h.poll();assert.equal(h.$('#feedback').textContent,'New error');
});

test('Nodes refreshes all incident memberships and packet signal/time without extra radio operations',async()=>{
 const h=harness();await h.poll();assert.equal(h.$('#radio-settings').elements.relayEnabled.checked,false);
 h.update({relayEnabled:false,peers:[{id:'node2',callsign:'REMOTE',incident:'99',name:'Other incident',online:true,lastHeardAgeMs:2000,rssi:-92.5,snr:7.25,relayed:true},{id:'node3',incident:'0000000000000000',online:false,lastHeardAgeMs:1000000}]});
 await h.poll();let rows=h.$('#node-list').children;
 assert.equal(rows.length,3);assert(rows[0].children.some(e=>e.value==='Connected · Relaying off'));
 assert(rows[1].children.some(e=>e.value.includes('Other incident · Incident ID 99')));
 assert(rows[1].children.some(e=>e.value.includes('Last heard 2s ago')));
 assert(rows[1].children.some(e=>e.value==='RSSI -92.5 dBm · SNR 7.3 dB · Forwarded packet · Last hop'));
 assert(rows[2].children.some(e=>e.value==='No incident selected'));
 assert(rows[2].children.some(e=>e.value==='RSSI / SNR unavailable'));
 h.update({peers:[{id:'node2',callsign:'REMOTE',incident:'42',name:'Test',online:true,lastHeardAgeMs:0,rssi:-60,snr:10,relayed:false}]});await h.poll();rows=h.$('#node-list').children;
 assert.equal(rows.length,2);assert(rows[1].children.some(e=>e.value.includes('Last hop')));assert(rows[1].children.some(e=>e.value.includes('Test · Incident ID 42')));
 assert(h.calls.every(c=>['status','chat','chat-reset'].includes(c)||typeof c==='object'&&c.path==='time'),JSON.stringify(h.calls));
});


test('transmission checkbox reflects effective legacy enable/pause state and preserves an edit',async()=>{
 const h=harness();
 for(const [txEnabled,paused,expected] of [[true,false,true],[true,true,false],[false,false,false],[false,true,false]]){
  h.update({txEnabled,paused});await h.poll();assert.equal(h.$('#radio-settings').elements.transmission.checked,expected);
 }
 h.$('#radio-settings').elements.transmission.checked=true;vm.runInContext('settingsDirty=true',h.context);h.update({txEnabled:false,paused:true});await h.poll();assert.equal(h.$('#radio-settings').elements.transmission.checked,true);
});

test('transmission checkbox saves On/Off and clears the legacy pause override',async()=>{
 const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');assert.match(html,/<input type="checkbox" name="transmission"/);assert.doesNotMatch(html,/name="(?:txEnabled|paused)"/);
 const controls={};for(const name of ['callsign','primary','backup','bandwidth','sf','cr','power','positionMinutes','transmission'])controls[name]={value:name==='callsign'?' test ':'10'};
 for(const name of ['useBackup','relayEnabled','positionEnabled'])controls[name]={checked:false};
 controls.transmission.checked=true;
 const f={elements:controls},saved=[];
 const context=vm.createContext({$:()=>f,run:fn=>fn,api:async(path,data)=>{assert.equal(path,'config');saved.push(data);return {radioReady:true};},poll:async()=>{},feedback(){}});
 vm.runInContext("let settingsLoaded=true,settingsDirty=true;"+source.slice(source.indexOf("$('#radio-settings').onsubmit="),source.indexOf('async function start()')),context);
 await f.onsubmit({preventDefault(){},target:f});assert.equal(saved[0].txEnabled,true);assert.equal(saved[0].paused,false);assert.equal(saved[0].relayEnabled,false);
 controls.transmission.checked=false;await f.onsubmit({preventDefault(){},target:f});assert.equal(saved[1].txEnabled,false);assert.equal(saved[1].paused,false);
});


test('reader displays the body before read-marker completion and reuses it for metadata refresh',async()=>{
 const h=harness();h.$('#traffic').hidden=false;await h.poll();let finishRead,bodyReads=0;
 const meta={id:'abc',state:'stored',subject:'Fast reader',sender:'TEST1',recipient:'*',priority:0,receipts:[]};
 h.context.priorities=['Routine'];h.context.deliveryStatus=()=>({complete:false,label:'Pending'});
 const original=h.context.api;h.context.api=async(path,body)=>{
  if(path==='form?id=abc'){++bodyReads;return {meta:{...meta},body:JSON.stringify({message:'Visible immediately'})};}
  if(path==='read')return new Promise(resolve=>{finishRead=resolve;});
  if(path.startsWith('forms?'))return {forms:[{...meta}],total:1,offset:0};
  return original(path,body);
 };
 vm.runInContext('let total=0;'+source.slice(source.indexOf('async function loadTraffic()'),source.indexOf('async function replyToForm')),h.context);
 const opening=vm.runInContext("openForm('abc')",h.context);await new Promise(resolve=>setImmediate(resolve));
 assert(descendants(h.$('#form-detail')).some(e=>e.value==='Visible immediately'));assert(finishRead);assert.equal(bodyReads,1);
 await h.poll();assert.equal(bodyReads,1);meta.receipts=[{id:'other',human:true}];await h.poll();assert.equal(bodyReads,1);
 finishRead({saved:true});await opening;assert.equal(bodyReads,1);
});


test('origin reader has no human-acknowledge button even with a historical self ACK',()=>{
 const h=harness();vm.runInContext("status={node:'self',callsign:'NEW-CALL'};selectedForm='own'",h.context);
 h.context.own={meta:{id:'own',origin:'self',sender:'OLD-CALL',receipts:[{id:'self',human:true}]},body:JSON.stringify({message:'My message'})};vm.runInContext('renderForm(own)',h.context);
 assert(!h.$('#form-detail').children.some(row=>row.children?.some(c=>['Acknowledge','Acknowledged'].includes(c.label))));
});


test('origin reader Resend queues once, retains receipts, and is absent on received forms',async()=>{
 const h=harness();vm.runInContext("status={node:'self',incident:'42',txEnabled:true,radioReady:true};selectedForm='own'",h.context);
 const own={meta:{id:'own',origin:'self',incident:'42',state:'stored',receipts:[{id:'other',human:true}]},body:JSON.stringify({message:'Original'})};h.context.own=own;vm.runInContext('renderForm(own)',h.context);
 const resend=h.$('#form-detail').children.flatMap(row=>row.children||[]).find(c=>c.label==='Resend');assert(resend);assert.equal(resend.disabled,false);
 let finish,calls=0;h.context.api=async(path,body)=>{assert.equal(path,'resend');assert.equal(body.id,'own');++calls;return new Promise(resolve=>finish=resolve);};h.context.poll=async()=>true;
 const pending=resend.onclick();await resend.onclick();assert.equal(calls,1);finish({queued:true});await pending;assert.equal(resend.textContent,'Resend');assert.equal(own.meta.receipts[0].human,true);
 own.meta.origin='other';vm.runInContext('renderForm(own)',h.context);assert(!h.$('#form-detail').children.flatMap(row=>row.children||[]).some(c=>c.label==='Resend'));
});

test('unknown nodes offer Request ID, show immediate wait feedback, then become named after Hello',async()=>{
 const h=harness();h.update({peers:[{id:'2222222222222222',online:true,lastHeardAgeMs:100}]});await h.poll();
 let row=h.$('#node-list').children[1],identify=row.children.find(e=>e.label==='Request ID');assert(identify);assert.equal(identify.disabled,false);
 let release;const original=h.context.api;h.context.api=(path,body)=>path==='nodes/request-id'?new Promise(resolve=>{assert.equal(body.id,'2222222222222222');release=resolve;}):original(path,body);
 const request=identify.onclick();row=h.$('#node-list').children[1];identify=row.children.find(e=>e.label==='Requesting…');assert(identify);assert.equal(identify.disabled,true);
 release({queued:true});await request;assert(h.$('#node-list').children[1].children.some(e=>e.label?.startsWith('Requested · retry in')));
 h.update({peers:[{id:'2222222222222222',callsign:'REMOTE',online:true,lastHeardAgeMs:100}]});await h.poll();row=h.$('#node-list').children[1];assert(row.children.some(e=>e.value==='REMOTE'));assert(!row.children.some(e=>e.label?.includes('Request')));
});

test('Request ID is disabled when TX is off and recovers after request failure',async()=>{
 const h=harness();h.update({txEnabled:false,peers:[{id:'2222222222222222',online:false}]});await h.poll();
 assert.equal(h.$('#node-list').children[1].children.find(e=>e.label==='Request ID').disabled,true);
 h.update({txEnabled:true});await h.poll();const identify=h.$('#node-list').children[1].children.find(e=>e.label==='Request ID');assert.equal(identify.disabled,false);
 h.context.api=async()=>{throw Error('Queue full');};await assert.rejects(identify.onclick(),/Queue full/);
 assert.equal(h.$('#node-list').children[1].children.find(e=>e.label==='Request ID').disabled,false);
});

test('Hide offline nodes filters remote rows, retains this radio, and saves the device preference',async()=>{
 const h=harness();h.update({peers:[{id:'online',callsign:'LIVE',online:true},{id:'offline',callsign:'QUIET',online:false}]});await h.poll();
 assert.equal(h.$('#node-list').children.length,3);const saves=[];h.context.db=async(...args)=>saves.push(args);
 h.$('#hide-offline-nodes').checked=true;await h.$('#hide-offline-nodes').onchange();
 assert.equal(h.$('#node-list').children.length,2);assert.match(h.$('#nodes-summary').textContent,/1 other nodes shown · 1 offline hidden/);
 assert.equal(saves[0][0],'settings');assert.equal(saves[0][1],'put');assert.equal(saves[0][2].id,'nodes-hide-offline');assert.equal(saves[0][2].value,true);
 assert(!h.$('#node-list').children[0].children.some(e=>e.label==='Forget node'));
 h.update({companionConnected:false,peers:[{id:'online',callsign:'LIVE',online:false},{id:'offline',callsign:'QUIET',online:false}]});await h.poll();assert.equal(h.$('#node-list').children.length,1);
 h.$('#hide-offline-nodes').checked=false;await h.$('#hide-offline-nodes').onchange();assert.equal(h.$('#node-list').children.length,3);
 assert(h.$('#node-list').children[1].children.find(e=>e.label==='Forget node').disabled);
});

test('Forget node shows busy immediately, coalesces clicks, clears one peer and permits packet rediscovery',async()=>{
 const h=harness(),peers=[{id:'2222222222222222',callsign:'OLD',online:false},{id:'3333333333333333',callsign:'LIVE',online:true}];h.update({txEnabled:false,peers});await h.poll();
 let release,requests=0;const original=h.context.api;h.context.api=(path,body)=>path==='nodes/forget'?(requests++,assert.equal(body.id,peers[0].id),new Promise(resolve=>{release=()=>{h.update({peers:[peers[1]]});resolve({saved:true});};})):original(path,body);
 const forget=h.$('#node-list').children[1].children.find(e=>e.label==='Forget node');assert.equal(forget.disabled,false);const pending=forget.onclick();
 assert(h.$('#node-list').children[1].children.find(e=>e.label==='Forgetting…').disabled);
 await h.context.forgetNode(peers[0].id);assert.equal(requests,1);release();await pending;
 assert.equal(h.$('#node-list').children.length,2);assert(h.$('#node-list').children[1].children.some(e=>e.value==='LIVE'));assert(h.calls.some(c=>typeof c==='string'&&c.includes('Node forgotten')));
 h.update({peers});await h.poll();assert.equal(h.$('#node-list').children.length,3);
});

test('forget failure keeps the peer and restores its button; source changes protect the new radio list',async()=>{
 const h=harness(),peers=[{id:'2222222222222222',callsign:'KEEP',online:true}];h.update({peers});await h.poll();
 const original=h.context.api;h.context.api=async()=>{throw Error('Disconnected');};await assert.rejects(h.context.forgetNode(peers[0].id),/Disconnected/);
 assert.equal(h.$('#node-list').children[1].children.find(e=>e.label==='Forget node').disabled,false);
 let release;h.context.api=(path,body)=>path==='nodes/forget'?new Promise(resolve=>{release=resolve;}):original(path,body);
 const pending=h.context.forgetNode(peers[0].id);h.update({node:'another-radio',peers});await h.poll();release({saved:true});await pending;
 assert.equal(h.$('#node-list').children.length,2);assert(h.$('#node-list').children[1].children.some(e=>e.value==='KEEP'));
});

test('incident deletion has explicit active/saved controls and cancellation leaves all messages alone',async()=>{
 const h=harness();h.$('#incidents').hidden=false;await h.poll();assert.equal(h.$('#delete-active-incident').disabled,false);
 assert(h.$('#retained').children[0].children[1].children.some(b=>b.label==='Delete incident & messages…'));
 let confirmed;h.context.confirm=message=>{confirmed=message;return false;};const original=h.context.api;let deletes=0;
 h.context.api=(path,body)=>{if(path==='incident/remove')++deletes;return original(path,body);};
 await h.context.removeIncident('Test','42');assert.equal(deletes,0);assert.match(confirmed,/ALL.*stored forms.*chat messages/);assert.match(confirmed,/other nodes’ copies.*kept/);
 h.update({incident:'0000000000000000'});await h.poll();assert.equal(h.$('#delete-active-incident').disabled,true);
});

test('delete active incident shows immediate busy state, prevents duplicates and reports full cleanup counts',async()=>{
 const h=harness();await h.poll();h.context.confirm=()=>true;
 vm.runInContext("selectedForm='abc';openRecord={meta:{id:'abc'}};",h.context);
 let release,deletes=0;const original=h.context.api;h.context.api=(path,body)=>path==='incident/remove'?(deletes++,assert.equal(body.id,'42'),new Promise(resolve=>{release=()=>{h.update({incident:'0000000000000000',incidentName:''});resolve({saved:true,forms:3,chatEvents:4});};})):original(path,body);
 const pending=h.context.removeIncident('Test','42');assert.equal(h.$('#delete-active-incident').textContent,'Deleting…');assert.equal(h.$('#delete-active-incident').disabled,true);
 await h.context.removeIncident('Test','42');assert.equal(deletes,1);release();await pending;
 assert.equal(vm.runInContext('openRecord',h.context),null);assert.equal(vm.runInContext('selectedForm',h.context),null);
 assert(h.calls.some(c=>typeof c==='string'&&/3 forms and 4 chat events removed/.test(c)));
});

test('failed incident deletion restores the control and does not discard the open record',async()=>{
 const h=harness();await h.poll();h.context.confirm=()=>true;vm.runInContext("selectedForm='abc';openRecord={meta:{id:'abc'}};",h.context);
 h.context.api=async()=>{throw Error('Storage unavailable');};await assert.rejects(h.context.removeIncident('Test','42'),/Storage unavailable/);
 assert.equal(h.$('#delete-active-incident').disabled,false);assert.equal(vm.runInContext('selectedForm',h.context),'abc');
});


test('received traffic includes the local radio and human ACK shown in the reader',async()=>{
 const h=harness();await h.poll();
 const meta={id:'received',origin:'sender',sender:'NET-SENDER',recipient:'*',subject:'Received',priority:0,state:'stored',receipts:[{id:'radio1',human:false}]};
 h.context.api=async()=>({forms:[meta],total:1,offset:0});h.context.deliveryStatus=deliveryStatus;
 vm.runInContext('let total=0;'+source.slice(source.indexOf('async function loadTraffic()'),source.indexOf('function renderForm(')),h.context);
 const receipt=()=>h.$('#traffic-list').children[0].children[1];
 await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Radio ACK');assert.match(receipt().title,/TEST2/);
 meta.recipient='TEST2';meta.receipts[0].human=true;
 await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Human ACK: TEST2');assert(!receipt().title.includes('Awaiting recipient'));
 meta.recipient='OTHER';await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Human ACK: TEST2 · recipient pending');
});


test('traffic refresh changes radio ACK to human ACK and adds every acknowledging callsign',async()=>{
 const h=harness();await h.poll();
 const meta={id:'human-update',origin:'radio1',sender:'ORIGIN',recipient:'*',subject:'Human update',priority:0,state:'stored',expected:[{id:'b',callsign:'NET-B'},{id:'c',callsign:'NET-C'}],receipts:[{id:'radio1',human:true},{id:'b',human:false}]};
 h.context.api=async()=>({forms:[meta],total:1,offset:0});h.context.deliveryStatus=deliveryStatus;
 vm.runInContext('let total=0;'+source.slice(source.indexOf('async function loadTraffic()'),source.indexOf('function renderForm(')),h.context);
 const receipt=()=>h.$('#traffic-list').children[0].children[1];
 await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Radio ACK');
 meta.receipts[1].human=true;await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Human ACK: NET-B');
 meta.receipts.push({id:'c',human:true});await vm.runInContext('loadTraffic()',h.context);assert.equal(receipt().value,'Human ACK: NET-B, NET-C');
 assert(!receipt().value.includes('ORIGIN'));assert.match(receipt().className,/human-acked/);assert.match(receipt().title,/Radio ACK.*NET-B.*Human ACK/);
});
