import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {manualAcknowledgments, receiptRows, formDeliverySummary, canReplyToForm} from '../web/model.js';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function harness(){
  const elements=new Map(),calls=[];
  function element(){return {hidden:true,children:[],elements:new Proxy({}, {get:(target,key)=>target[key]??=( {value:'',checked:false})}),replaceChildren(...items){this.children=[...items];},append(...items){this.children.push(...items);},setAttribute(){},dataset:{},classList:{toggle(){}}};}
  const $=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);};
  let next={node:'radio1',bootSession:1,callsign:'TEST2',frequency:919.5,peers:[],incident:'42',incidentName:'Test',storageUsed:0,storageTotal:1048576,queue:0,fsReady:true,radioReady:true,txEnabled:true,band:'uhf',board:'Heltec',clockSource:'unset',power:14};
  let record={meta:{id:'abc',state:'stored',subject:'Hello'},body:JSON.stringify({message:'New message'})};
  const context=vm.createContext({updateNavigationBadges(){},positionClient:{update(){}},canReplyToForm,mapPanel:{update(){}},$,api:async path=>{calls.push(path);if(path==='status')return next;if(path.startsWith('form?'))return record;if(path==='incidents')return {incidents:[{id:'42',name:'Test'}]};throw Error(path);},text:(tag,value)=>({...element(),tag,value}),button:(label,onclick)=>({label,textContent:label,onclick}),run:fn=>fn,refreshFormFeedback(){},feedback:message=>calls.push(message),renderReceipts:()=>calls.push('receipts'),loadTraffic:async()=>calls.push('traffic'),loadChatMessages:async()=>calls.push('chat'),chatControls(){},resetChat(){calls.push('chat-reset');},joinIncident(){}});
  const originalApi=context.api;context.api=async(path,body)=>path==='time'?(calls.push({path,body}),{saved:true}):originalApi(path,body);
  vm.runInContext("let timeSyncTarget='',timeSynced=false,timeSyncRetryAt=0;let messageNeighbors={previous:null,next:null};let status=null,polling=null,settingsLoaded=false,settingsDirty=false,selectedForm=null,displayedRecord='',offset=0;"+source.slice(source.indexOf('function poll()'),source.indexOf('function deliveryIndicator'))+source.slice(source.indexOf('function renderForm('),source.indexOf('async function refreshData'))+source.slice(source.indexOf('async function loadRetainedIncidents'),source.indexOf('async function loadArchives')),context);
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
  assert.ok(h.$('#form-detail').children.some(e=>e.value==='New message'));
  h.setRecord({meta:{id:'abc',state:'offloaded',subject:'Hello'}});await h.poll();
  assert.ok(h.$('#form-detail').children.some(e=>e.value?.includes('offloaded or discarded')));
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
    h.context.record={meta:{id:'abc',receipts},body:JSON.stringify({message:'Test'})};
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

test('message detail renders and refreshes the complete manual callsign list',()=>{
  const h=harness();
  h.context.manualAcknowledgments=manualAcknowledgments;h.context.receiptRows=receiptRows;
  h.context.deliveryIndicator=()=>h.context.text('div','Radio delivery');
  h.context.document={createElement:tag=>h.context.text(tag,'')};
  vm.runInContext("status={node:'self',callsign:'NET-A',peers:[{id:'b',callsign:'NET-B'}]};"+source.slice(source.indexOf('function renderReceipts('),source.indexOf('async function loadTraffic()')),h.context);
  h.context.meta={receipts:[{id:'self',human:true},{id:'b',human:true},{id:'c',human:false}]};
  vm.runInContext('renderReceipts(meta)',h.context);
  const humanRow=()=>h.$('#delivery-detail').children[1].children[0].value;
  assert.equal(humanRow(),'Human Ack: NET-A, NET-B');
  h.context.meta.receipts.push({id:'offline',callsign:'NET-C',human:true});
  vm.runInContext('renderReceipts(meta)',h.context);assert.equal(humanRow(),'Human Ack: NET-A, NET-B, NET-C');
  h.context.meta={receipts:[{id:'c',human:false}]};
  vm.runInContext('renderReceipts(meta)',h.context);assert.equal(humanRow(),'Human Ack: None yet');
});

test('TX power range comes from the board and refreshes without overwriting an edit',async()=>{
  const h=harness();h.update({powerMin:2,powerMax:22,powerIsDrive:false,power:22});await h.poll();
  const power=h.$('#radio-settings').elements.power;
  assert.equal(power.max,22);assert.equal(power.min,2);assert.equal(power.value,'22');
  assert.equal(h.$('#tx-power-label').textContent,'TX power · dBm');
  power.value='18';vm.runInContext('settingsDirty=true',h.context);
  h.update({powerMax:20});await h.poll();assert.equal(power.max,20);assert.equal(power.value,'18');
  h.update({powerMax:22,powerIsDrive:true});await h.poll();
  assert.equal(h.$('#tx-power-label').textContent,'TX chip drive · dBm');assert.match(h.$('#tx-power-help').textContent,/not final antenna output/);
  h.update({powerMax:10,band:'vhf'});await h.poll();assert.equal(power.max,10);
});

test('sent message info bar refreshes ACKs after returning to the list without replacing unrelated feedback',async()=>{
 const h=harness();h.context.formDeliverySummary=formDeliverySummary;
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
