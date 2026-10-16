import {priorities, utf8, token, validateForm, receiptRows, verifyArchive, deliveryStatus, manualAcknowledgments, numberUntitledDrafts, draftLabel, chatEmojis, validateChatText, chatRadioStatus, chatReactionGroups} from './model.js';
const $ = selector => document.querySelector(selector);
let status = null, offset = 0, total = 0, draftTimer, locationData = null, settingsLoaded = false, boundIncident = '';
let messageNeighbors = {previous:null,next:null};
let selectedForm = null, polling = null, settingsDirty = false, displayedRecord = '';
const form = $('#form8');
const database = new Promise((resolve, reject) => {
  const req = indexedDB.open('form8-client', 2);
  req.onupgradeneeded = () => { for (const name of ['drafts','archives','settings'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name, {keyPath:'id'}); };
  req.onsuccess = () => {req.result.onversionchange=()=>req.result.close();resolve(req.result);}; req.onerror = () => reject(req.error);
  req.onblocked = () => reject(new Error('Close other Form8 tabs, then reopen this page to update local draft storage.'));
});
async function db(store, action, value) {
  const databaseHandle = await database;
  if(store==='drafts' && ['getAll','put','delete'].includes(action))return draftRecords(databaseHandle,action,value);
  return new Promise((resolve, reject) => {
    const transaction = databaseHandle.transaction(store, action === 'get' || action === 'getAll' ? 'readonly' : 'readwrite');
    const request = transaction.objectStore(store)[action](value);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || new Error('Local save aborted'));
  });
}
function draftRecords(databaseHandle,action,value) {
  // Number assignment, draft updates, and counter resets share one transaction
  // so autosave and other browser tabs cannot allocate the same number.
  return new Promise((resolve,reject)=>{
    const transaction=databaseHandle.transaction(['drafts','settings'],'readwrite');
    const drafts=transaction.objectStore('drafts'),settings=transaction.objectStore('settings');
    const records=drafts.getAll(),counter=settings.get('untitled-counter');
    let ready=0,result;
    const update=()=>{
      if(++ready<2)return;
      try {
        const original=records.result,savedById=new Map(original.map(draft=>[draft.id,draft]));
        let current=original;
        if(action==='put'){
          const previous=savedById.get(value.id);
          current=original.filter(draft=>draft.id!==value.id);
          current.push({...value,untitledNumber:previous?.untitledNumber});
        }else if(action==='delete')current=original.filter(draft=>draft.id!==value);
        result=numberUntitledDrafts(current,counter.result?.value||0);
        if(action==='delete')drafts.delete(value);
        for(const draft of result.drafts){
          const previous=savedById.get(draft.id);
          if((action==='put' && draft.id===value.id) || !previous || previous.untitledNumber!==draft.untitledNumber)drafts.put(draft);
        }
        if(counter.result?.value!==result.counter)settings.put({id:'untitled-counter',value:result.counter});
      }catch(error){transaction.abort();reject(error);}
    };
    records.onsuccess=update;counter.onsuccess=update;
    transaction.oncomplete=()=>resolve(action==='getAll'?result.drafts:action==='put'?value.id:undefined);
    transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error||new Error('Draft save aborted'));
  });
}
async function api(path, body) {
  const method = body === undefined ? 'GET' : 'POST';
  const native = globalThis.Form8Native?.isNative();
  if (native) {
    const response = await Form8Native.request({url:`http://192.168.4.1/api/${path}`,method,headers:{'Content-Type':'application/json'},data:body,connectTimeout:6000,readTimeout:15000});
    const result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (response.status >= 400) throw new Error(result.error || 'Radio request failed');
    return result;
  }
  const response = await fetch(`/api/${path}`, {method, cache:'no-store', headers:body === undefined ? {} : {'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Radio request failed');
  return result;
}
function feedback(message, error = false) { const e=$('#feedback');e.hidden=false;e.textContent=message;e.classList.toggle('error',error); }
function run(fn) { return async event => { try { await fn(event); } catch(error) { feedback(error.message, true); } }; }
function text(tag, value, className) { const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el; }
function button(label, fn, className='secondary') { const b=text('button',label,className);b.type='button';b.onclick=run(fn);return b; }
function showTab(tab) {
  for(const e of document.querySelectorAll('main > .panel'))e.hidden=e.id!==tab;
  for(const b of document.querySelectorAll('nav button')){const selected=b.dataset.tab===tab;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
  if(tab==='chat')run(loadChatMessages)();if(tab==='traffic')run(loadTraffic)();if(tab==='incidents')run(loadIncidents)();if(tab==='archive')run(loadArchives)();
}
for(const b of document.querySelectorAll('nav button'))b.onclick=()=>showTab(b.dataset.tab);
function values() {
  const d=Object.fromEntries(new FormData(form));d.type='net-form-8';d.priority=Number(d.priority);
  d.recipient=d.addressMode==='broadcast'?'*':(d.recipient||'').trim().toUpperCase();delete d.addressMode;
  if(d.lat!=='' && d.lon!=='')d.location={...(locationData||{source:'manual',capturedAt:new Date().toISOString(),fixAgeMs:0}),lat:Number(d.lat),lon:Number(d.lon)};
  if(boundIncident)d.boundIncident=boundIncident;
  delete d.lat;delete d.lon;return d;
}
async function saveDraft() {
  const d=values();await db('drafts','put',{id:d.clientToken,form:d,savedAt:Date.now()});
  $('#draft-state').textContent='Saved on this device';await draftList();
}
async function draftList() {
  const list=$('#draft-list');list.replaceChildren();
  for(const draft of (await db('drafts','getAll')).sort((a,b)=>b.savedAt-a.savedAt)){
    const subject=draftLabel(draft),item=text('div','','draft-item');
    const remove=button('Delete',()=>deleteDraft(draft.id,subject),'draft-delete');
    remove.setAttribute('aria-label',`Delete draft: ${subject}`);
    item.append(button(subject,async()=>{await saveDraft();fill(draft.form);}),remove);list.append(item);
  }
}
async function deleteDraft(id,subject) {
  if(!confirm(`Delete draft “${subject}” from this device? This cannot be undone.`))return;
  if(form.elements.clientToken.value===id)clearTimeout(draftTimer);
  await db('drafts','delete',id);
  if(form.elements.clientToken.value===id)fill();
  await draftList();feedback('Draft deleted from this device.');
}
function fill(d={}) {
  form.reset();locationData=d.location||null;boundIncident=d.boundIncident||'';
  for(const [name,value] of Object.entries(d))if(form.elements.namedItem(name) && typeof value!=='object')form.elements.namedItem(name).value=value;
  form.elements.clientToken.value=d.clientToken||token();form.elements.addressMode.value=d.recipient && d.recipient!=='*'?'callsign':'broadcast';
  form.elements.recipient.disabled=form.elements.addressMode.value==='broadcast';
  if(d.location){form.elements.lat.value=d.location.lat;form.elements.lon.value=d.location.lon;}
  if(!d.date){const now=new Date();form.elements.date.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;form.elements.time.value=now.toTimeString().slice(0,5);}
  counts();$('#draft-state').textContent=d.clientToken?'Saved on this device':'New draft · not saved yet';
}
function counts() {
  $('#body-count').textContent=`${utf8(form.elements.message.value).length} / 2800 bytes`;
  $('#parent-note').textContent=form.elements.parent.value?`Linked to ${form.elements.parent.value.slice(-8)}`:'';
  $('#location-info').textContent=locationData?`${locationData.source} · captured ${locationData.capturedAt} · fix age ${Math.round((locationData.fixAgeMs||0)/1000)}s at capture`:'Manual coordinates will be attached if both fields are filled.';
}
form.oninput=()=>{counts();$('#draft-state').textContent='Saving…';clearTimeout(draftTimer);draftTimer=setTimeout(()=>run(saveDraft)(),400);};
form.elements.addressMode.onchange=()=>{form.elements.recipient.disabled=form.elements.addressMode.value==='broadcast';};
for(const name of ['lat','lon'])form.elements[name].addEventListener('input',()=>{locationData=null;counts();});
$('#new-draft').onclick=run(async()=>{clearTimeout(draftTimer);await saveDraft();fill();await saveDraft();});
form.onsubmit=run(async event=>{
  event.preventDefault();clearTimeout(draftTimer);await saveDraft();const d=validateForm(values());
  if(!status || status.incident==='0000000000000000')throw new Error('Connect to a radio and join an incident before submitting. Your draft is saved.');
  // Bind the draft before submission so reconnecting to a different incident cannot
  // accidentally submit it there after an ambiguous HTTP response.
  if(d.boundIncident && d.boundIncident!==status.incident)throw new Error('This draft is bound to another incident. Join that incident before submitting.');
  d.boundIncident=status.incident;await db('drafts','put',{id:d.clientToken,form:d,savedAt:Date.now()});
  boundIncident=d.boundIncident;
  const result=await api('forms',d);await db('drafts','delete',d.clientToken);fill();await saveDraft();
  feedback(`Form ${result.id.slice(-8)} saved to radio${status.paused?' · transmission paused':!status.txEnabled?' · transmission disabled': ' · awaiting radio ACK'}.`);showTab('traffic');await openForm(result.id);await poll();
});
$('#phone-location').onclick=run(async()=>{
  const button=$('#phone-location'),label=button.textContent;
  button.disabled=true;button.textContent='Getting location…';
  try {
    let position;
    if(globalThis.Form8Native?.isNative())position=await Form8Native.getLocation({enableHighAccuracy:true,timeout:15000,maximumAge:0});
    else {
      if(!navigator.geolocation)throw new Error('Location is unavailable in this browser. Use the companion app or enter latitude and longitude manually.');
      position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
    }
    const {latitude,longitude}=position.coords;
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new Error('No valid coordinates were returned. Try again or enter latitude and longitude manually.');
    const captured=Date.now();locationData={source:'phone',capturedAt:new Date(captured).toISOString(),fixAgeMs:Math.max(0,captured-position.timestamp),accuracy:position.coords.accuracy};
    form.elements.lat.value=latitude;form.elements.lon.value=longitude;counts();
    await saveDraft();feedback('Latitude and longitude filled from this device’s location.');
  } catch(error) {
    const messages={1:'Location permission denied. Allow location access for this app or browser, then try again.',2:'This device could not determine its location. Try again or enter latitude and longitude manually.',3:'Location request timed out. Try again or enter latitude and longitude manually.'};
    throw new Error(messages[error.code]||error.message||'Unable to get this device’s location.');
  } finally {
    button.disabled=false;button.textContent=label;
  }
});
$('#clear-location').onclick=run(async()=>{locationData=null;form.elements.lat.value='';form.elements.lon.value='';counts();await saveDraft();});
let chatReply=null, chatIncident='', chatSubmission=null, chatRendered='', chatSending=false, chatVersion='', chatMessages=[];
const reactionSubmissions=new Map(),reactionBusy=new Set();
function chatControls(){
  const length=utf8($('#chat-text').value).length;
  $('#chat-byte-count').textContent=`${length} / 200 bytes`;
  $('#chat-byte-count').classList.toggle('over-limit',length>200);
  const changed=!!$('#chat-text').value && chatIncident && chatIncident!==status?.incident;
  $('#chat-context').hidden=!changed;$('#chat-review').hidden=!changed;
  $('#chat-context').textContent='The incident changed. Review this text before sending it to the current incident.';
  $('#chat-send').disabled=chatSending || !status || status.incident==='0000000000000000' || changed || length>200 || !$('#chat-text').value.trim();
  $('#chat-text').disabled=chatSending;
  $('#chat-reply').hidden=!chatReply;
  $('#chat-reply-label').textContent=chatReply?`Reply to ${chatReply.sender}: ${chatReply.text}`:'';
}
function resetChat(){
  chatReply=null;chatRendered='';chatVersion='';chatMessages=[];chatSubmission=null;reactionSubmissions.clear();
  $('#chat-list').replaceChildren();
}
$('#chat-text').addEventListener('input',()=>{
  if(!chatIncident || !$('#chat-text').value)chatIncident=status?.incident||'';
  chatSubmission=null;chatControls();
});
$('#chat-review').onclick=()=>{chatIncident=status?.incident||'';chatSubmission=null;chatControls();};
$('#chat-cancel-reply').onclick=()=>{chatReply=null;chatSubmission=null;chatControls();};
for(const emoji of chatEmojis){
  const insert=button(emoji,()=>{
    const input=$('#chat-text');input.setRangeText(emoji,input.selectionStart,input.selectionEnd,'end');
    input.dispatchEvent(new Event('input'));input.focus();
  },'secondary');insert.setAttribute('aria-label',`Insert ${emoji}`);$('#chat-emojis').append(insert);
}
async function reactToChat(message,emoji){
  const incident=status?.incident;if(!incident || incident==='0000000000000000')throw new Error('Join an incident first.');
  const key=`${incident}:${message.id}:${emoji}`;if(reactionBusy.has(key))return;
  const enabled=!(message.reactions||[]).some(reaction=>reaction.emoji===emoji && reaction.origin===status.node);
  let submission=reactionSubmissions.get(key);
  if(!submission || submission.active!==enabled){submission={type:'chat-reaction',clientToken:token(),incident,target:message.id,emoji,active:enabled};reactionSubmissions.set(key,submission);}
  reactionBusy.add(key);
  try {await api('chat',submission);reactionSubmissions.delete(key);await loadChatMessages();}
  finally {reactionBusy.delete(key);}
}
async function loadChatMessages(){
  const incident=status?.incident;
  chatControls();
  if(!incident || incident==='0000000000000000'){
    $('#chat-list').replaceChildren(text('p','Join an incident to chat.','muted'));return;
  }
  const result=await api(`chat${chatVersion?`?since=${encodeURIComponent(chatVersion)}`:''}`);
  if(status?.incident!==incident || result.incident!==incident)return;
  if(result.unchanged)result.messages=chatMessages;
  else {chatMessages=result.messages;chatVersion=result.version||'';}
  const signature=JSON.stringify([result.messages,status.node,status.peers]);
  if(signature===chatRendered)return;
  chatRendered=signature;
  const list=$('#chat-list'),atBottom=list.scrollHeight-list.clientHeight-list.scrollTop<80,scroll=list.scrollTop;
  const opened=new Set([...list.querySelectorAll('details[open]')].map(detail=>detail.dataset.message));
  list.replaceChildren();
  for(const message of result.messages){
    const item=text('article','',`chat-message${message.origin===status.node?' chat-own':''}`);item.dataset.message=message.id;
    const heading=text('div','','chat-heading'),date=new Date(message.sentAt*1000);
    heading.append(text('strong',message.sender),text('span',message.sentAt>=1577836800?date.toLocaleString():'Time not synchronized','muted'));item.append(heading);
    if(message.parent){
      const parent=result.messages.find(candidate=>candidate.id===message.parent);
      item.append(text('blockquote',parent?`${parent.sender}: ${parent.text}`:`Reply to earlier message · ${message.parent.slice(-8)}`,'chat-quote'));
    }
    item.append(text('p',message.text,'chat-body'));
    item.append(text('p',chatRadioStatus(message,status.peers,status.node),'chat-radio-ack'));
    const actions=text('div','','chat-message-actions');
    for(const group of chatReactionGroups(message,status.node)){
      const reaction=button(`${group.emoji} ${group.count}`,()=>reactToChat(message,group.emoji),`secondary chat-reaction${group.mine?' mine':''}`);
      reaction.setAttribute('aria-pressed',String(group.mine));reaction.title=`${group.people.join(', ')}${group.status?` · ${group.status}`:''}`;actions.append(reaction);
    }
    actions.append(button('Reply',()=>{chatReply={id:message.id,sender:message.sender,text:message.text};chatIncident=incident;chatSubmission=null;chatControls();$('#chat-text').focus();}));
    const picker=text('details','','chat-reaction-picker');picker.dataset.message=message.id;picker.open=opened.has(message.id);picker.append(text('summary','React'));
    const palette=text('div','','chat-emojis');
    for(const emoji of chatEmojis){const choice=button(emoji,()=>reactToChat(message,emoji),'secondary');choice.setAttribute('aria-label',`React ${emoji} to ${message.sender}`);palette.append(choice);}
    picker.append(palette);actions.append(picker);item.append(actions);list.append(item);
  }
  if(!result.messages.length)list.append(text('p','No chat messages on this radio yet.','muted'));
  if(atBottom)list.scrollTop=list.scrollHeight;else list.scrollTop=scroll;
}
$('#chat-form').onsubmit=run(async event=>{
  event.preventDefault();validateChatText($('#chat-text').value);chatControls();
  if($('#chat-send').disabled)throw new Error('Connect, join an incident, and review the chat destination before sending.');
  chatIncident=status.incident;
  const payload={type:'chat-message',text:$('#chat-text').value,incident:chatIncident,...(chatReply?{parent:chatReply.id}:{})};
  if(!chatSubmission || chatSubmission.signature!==JSON.stringify(payload))chatSubmission={signature:JSON.stringify(payload),...payload,clientToken:token()};
  const {signature,...submission}=chatSubmission;chatSending=true;chatControls();
  try {
    await api('chat',submission);$('#chat-text').value='';chatReply=null;chatSubmission=null;chatIncident='';
    feedback('Chat saved to radio. Delivery receipts will appear in Chat.');await loadChatMessages();
  }finally {chatSending=false;chatControls();}
});
function poll() {
  if(polling)return polling;
  polling=refreshScreen().finally(()=>{polling=null;});
  return polling;
}
async function refreshScreen() {
  try {
    const next=await api('status');
    if(status && status.incident!==next.incident){offset=0;selectedForm=null;displayedRecord='';setTrafficView();resetChat();}
    status=next;
    chatControls();
    $('#connection').textContent=next.simulated?'Simulation · no RF':next.paused?'Connected · TX paused':!next.txEnabled?'Connected · TX disabled':'Connected to radio';
    $('#active-name').textContent=next.incidentName||'Choose an incident';
    $('#incident-id').textContent=next.incident==='0000000000000000'?'No incident selected':`Incident ID ${next.incident}`;
    $('#radio-diagnostics').textContent=`RX packets ${next.rxPackets||0} · Valid frames ${next.rxFrames||0} · TX frames ${next.txFrames||0} · RX errors ${next.rxErrors||0} · Last RX error ${next.lastRxError||0} · Dropped from queue ${next.dropped||0}`;
    $('#station').textContent=`${next.callsign||'Callsign not set'} · ${next.frequency.toFixed(3)} MHz · ${next.peers.filter(p=>p.online&&p.incident===next.incident&&next.incident!=='0000000000000000').length} nearby incident nodes · ${next.peers.filter(p=>p.online).length} nodes heard`;
    $('#message-status').textContent=`${next.unreadMessages||0} unread · ${next.outgoingMessages||0} awaiting radio ACK`;
    $('#storage').textContent=`${(next.storageUsed/1048576).toFixed(1)} / ${(next.storageTotal/1048576).toFixed(1)} MB`;
    $('#queue').textContent=`${next.queue} queue items`;
    $('#warning').hidden=!next.storageWarning && next.fsReady && next.radioReady;
    $('#warning').textContent=!next.fsReady?'Radio storage unavailable. Upload the filesystem image for first setup; do not overwrite an existing incident filesystem.':!next.radioReady?`Radio initialization failed (${next.radioError}).`: 'Storage is running low. Archive older delivered forms or explicitly discard selected bodies.';
    $('#board-info').textContent=`${next.board} · ${next.band.toUpperCase()} profile · ${next.clockSource}${next.powerNote?` · ${next.powerNote}`:''}`;
    if(!settingsLoaded || !settingsDirty){
      const f=$('#radio-settings');for(const key of ['callsign','primary','backup','bandwidth','sf','cr','power'])f.elements[key].value=String(next[key]);
      for(const key of ['useBackup','txEnabled','paused'])f.elements[key].checked=next[key];
      f.elements.power.max=next.band==='vhf'?10:20;settingsLoaded=true;
    }
    renderNearbyIncidents();
    const updates=[];
    if(!$('#traffic').hidden){
      updates.push(loadTraffic());
      if(selectedForm){const id=selectedForm;updates.push(api(`form?id=${id}`).then(record=>{if(selectedForm===id)renderForm(record);}));}
    }
    if(!$('#chat').hidden)updates.push(loadChatMessages());
    if(!$('#incidents').hidden)updates.push(loadRetainedIncidents());
    const results=await Promise.allSettled(updates);
    if(results.some(result=>result.status==='rejected')){feedback('Some displayed data could not refresh. Retrying automatically.',true);return false;}
    return true;
  }catch(error){status=null;$('#connection').textContent='Radio disconnected · drafts available';return false;}
}
function deliveryIndicator(m) {
  const delivery=deliveryStatus(m,status?.peers||[],status?.node);
  const block=text('div','','delivery '+(delivery.complete?'acked':'pending'));
  block.append(text('strong',delivery.label));
  if(delivery.pending.length)block.append(text('p',`Pending: ${delivery.pending.join(', ')}`));
  else if(!delivery.complete)block.append(text('p','No remote station has acknowledged yet.'));
  return block;
}
function renderReceipts(m) {
  const container=$('#delivery-detail');if(!container)return;
  container.replaceChildren(deliveryIndicator(m));
  const acknowledged=manualAcknowledgments(m,status?.peers||[],status?.node,status?.callsign);
  container.append(text('h3','Manually acknowledged by'));
  if(acknowledged.length){
    const list=text('ul','','manual-ack-list');
    for(const callsign of acknowledged)list.append(text('li',callsign));
    container.append(list);
  }else container.append(text('p','No manual acknowledgments yet.','muted'));
  const table=document.createElement('table'),head=document.createElement('tr');for(const title of ['Station','Receipt'])head.append(text('th',title));table.append(head);
  for(const r of receiptRows(m,status?.peers||[],status?.node)){const tr=document.createElement('tr');tr.append(text('td',r.callsign),text('td',r.status));table.append(tr);}
  container.append(table);
}
async function loadTraffic() {
  const selected=selectedForm,all=$('#all-incidents').checked;
  const result=await api(`forms?offset=${offset}${all?'&all=1':''}${selected?`&selected=${selected}`:''}`);
  if(selected!==selectedForm || all!==$('#all-incidents').checked)return;
  total=result.total;offset=result.offset;
  messageNeighbors={previous:result.previous||null,next:result.next||null};renderMessageNavigation();
  const list=$('#traffic-list');list.replaceChildren();
  for(const m of result.forms){
    const row=text('div','','traffic-item'),description=text('div','');
    const heading=text('div','','traffic-subject');
    heading.append(text('span',priorities[m.priority],'badge'+(m.priority===3?' urgent':'')),text('strong',m.subject||'(No subject)'));
    if(m.unread)heading.append(text('span','Unread','badge'));
    description.append(heading,text('p',`${m.sender} → ${m.recipient==='*'?'Broadcast':m.recipient} · ${m.state}`));
    const delivery=deliveryStatus(m,status?.peers||[],status?.node),receipt=text('span',delivery.complete?'Radio ACK':'Pending ACK','traffic-receipt'+(delivery.complete?' acked':''));receipt.title=delivery.label;
    row.append(description,receipt,button('Open',()=>openForm(m.id)));list.append(row);
  }
  if(!result.forms.length)list.append(text('p','No forms in this view.','muted'));
  $('#page-label').textContent=`${total?offset+1:0}–${Math.min(offset+20,total)} of ${total}`;
  $('#previous-page').disabled=offset===0;$('#next-page').disabled=offset+20>=total;
}
async function openForm(id) {
  selectedForm=id;messageNeighbors={previous:null,next:null};renderMessageNavigation();
  const record=await api(`form?id=${id}`);
  if(selectedForm!==id)return;
  await api('read',{id});
  if(selectedForm!==id)return;
  displayedRecord='';renderForm(record);
  await poll();
}
function renderForm(record) {
  setTrafficView();
  const signature=JSON.stringify(record);
  if(signature===displayedRecord){renderReceipts(record.meta);return;}
  displayedRecord=signature;
  const m=record.meta,id=m.id,detail=$('#form-detail');detail.replaceChildren();detail.hidden=false;
  detail.append(text('h3',m.subject||'General message'),text('p',`ID ${m.id} · ${m.state}`,'muted'));
  if(record.body){
    const d=JSON.parse(record.body);
    detail.append(text('p',`${d.from||d.sender} → ${d.to||d.recipient} · ${d.date||''} ${d.time||''}`),text('pre',d.message,'message'));
    if(d.location)detail.append(text('p',`${d.location.lat}, ${d.location.lon} · ${d.location.source} · fix age ${d.location.fixAgeMs||0} ms`,'muted'));
    if(d.parent)detail.append(text('p',`Reply/correction linked to ${d.parent}`,'muted'));
    const actions=text('div','','actions');
    const acknowledged=(m.receipts||[]).some(receipt=>receipt.id===status?.node && receipt.human);
    const acknowledge=button(acknowledged?'Acknowledged':'Acknowledge',async()=>{
      acknowledge.disabled=true;acknowledge.textContent='Acknowledging…';
      try {
        await api('ack',{id});
        acknowledge.textContent='Acknowledged';
      } catch(error) {
        acknowledge.disabled=false;acknowledge.textContent='Acknowledge';throw error;
      }
      await poll();
    });
    acknowledge.disabled=acknowledged;
    actions.append(acknowledge,button('Reply',async()=>{
      await saveDraft();fill({parent:id,subject:`Re: ${d.subject||''}`.slice(0,160),to:d.from,from:d.to,recipient:d.sender,priority:m.priority});await saveDraft();showTab('compose');
    }),button('Correction',async()=>{
      await saveDraft();const corrected={...d,clientToken:token(),parent:id,subject:`Correction: ${d.subject||''}`.slice(0,160)};delete corrected.boundIncident;fill(corrected);await saveDraft();showTab('compose');
    }),button('Archive & free radio storage',async()=>{
      const pending=receiptRows(m,status?.peers||[],status?.node).filter(r=>!r.received).length;
      if(!confirm(`Save and verify a copy on this device, then remove this radio's form body? ${pending} tracked nodes still pending. Delivery status will stay unchanged.`))return;
      verifyArchive(record);await db('archives','put',{...record,id:m.id,archivedAt:Date.now()});
      verifyArchive(await db('archives','get',m.id));await api('offload',{id,mode:'archive',hash:m.hash,verified:true});
      feedback('Archive verified on this device. Radio body removed; receipt history retained.');await loadTraffic();await openForm(id);
    }),button('Discard locally',async()=>{
      if(!confirm('Discard this radio’s form body without making an archive? Other nodes keep their copies. This radio will not automatically download it again.'))return;
      await api('offload',{id,mode:'discard'});await loadTraffic();await openForm(id);
    },'danger'));detail.append(actions);
  }else detail.append(text('p','The body has been offloaded or discarded on this radio. Check the device archive.','muted'));
  const delivery=text('div','');delivery.id='delivery-detail';delivery.setAttribute('aria-live','polite');detail.append(delivery);renderReceipts(m);
}
function setTrafficView() {
  const reading=!!selectedForm;
  $('#traffic-overview').hidden=reading;$('#message-reader').hidden=!reading;
  $('#form-detail').hidden=!reading;$('#traffic-title').textContent=reading?'Message':'Incident traffic';
  renderMessageNavigation();
}
function renderMessageNavigation() {
  $('#previous-message').hidden=!selectedForm || !messageNeighbors.previous;
  $('#next-message').hidden=!selectedForm || !messageNeighbors.next;
}
async function backToTraffic() {
  selectedForm=null;displayedRecord='';messageNeighbors={previous:null,next:null};setTrafficView();await loadTraffic();
}
$('#message-back').onclick=run(backToTraffic);
$('#previous-message').onclick=run(async()=>{if(messageNeighbors.previous)await openForm(messageNeighbors.previous);});
$('#next-message').onclick=run(async()=>{if(messageNeighbors.next)await openForm(messageNeighbors.next);});
async function refreshData(tab) {
  const refreshed=await poll();
  if(!status)throw new Error('Radio unavailable. Local drafts are still saved.');
  if(!refreshed)throw new Error('Some displayed data could not refresh. Retrying automatically.');
  if(tab==='compose')await draftList();
  if(tab==='archive')await loadArchives();
  feedback('Data refreshed. Unsaved edits kept.');
}
for(const refresh of document.querySelectorAll('[data-refresh]'))refresh.onclick=run(async()=>{
  const label=refresh.textContent;refresh.disabled=true;refresh.textContent='Refreshing…';
  try {await refreshData(refresh.dataset.refresh);}finally{refresh.disabled=false;refresh.textContent=label;}
});
$('#all-incidents').onchange=run(async()=>{offset=0;await loadTraffic();});
$('#previous-page').onclick=run(async()=>{offset=Math.max(0,offset-20);await loadTraffic();});$('#next-page').onclick=run(async()=>{offset+=20;await loadTraffic();});
async function joinIncident(name,id) {await api('incident',{name,id});await poll();feedback(`Joined ${name}. Previous incident traffic is paused.`);await loadIncidents();}
$('#create-incident').onsubmit=run(async event=>{event.preventDefault();await joinIncident(event.target.elements.name.value);event.target.reset();});
async function loadIncidents() {
  await poll();renderNearbyIncidents();await loadRetainedIncidents();
}
async function loadRetainedIncidents() {
  const result=await api('incidents'),retained=$('#retained');retained.replaceChildren();for(const i of result.incidents)appendIncident(retained,i.name,i.id);
}
function appendIncident(container,name,id) {
  const row=text('div','','incident-item');row.append(text('div',`${name} · ${id}`),button(id===status?.incident?'Active':'Join',()=>joinIncident(name,id)));container.append(row);
}
function renderNearbyIncidents() {
  const nearby=$('#nearby');nearby.replaceChildren();const seen=new Set();
  for(const peer of status?.peers||[])if(peer.online&&peer.incident!=='0000000000000000'&&!seen.has(peer.incident)){seen.add(peer.incident);appendIncident(nearby,peer.name,peer.incident);}
  if(!seen.size)nearby.append(text('p','No nearby incidents advertised yet.','muted'));
}
async function loadArchives() {
  const list=$('#archive-list');list.replaceChildren();
  for(const record of await db('archives','getAll')){
    const row=text('div','','archive-item');row.append(text('div',`${record.meta.subject||'General message'} · ${record.meta.incident}`),button('Read',()=>{const d=JSON.parse(record.body);const pre=text('pre',d.message,'message');row.append(pre);}),button('Export',()=>download([record])));list.append(row);
  }
  if(!list.children.length)list.append(text('p','No archived forms on this device.','muted'));
}
function download(records) {
  const blob=new Blob([JSON.stringify({format:'form8-archive-v1',records},null,2)],{type:'application/json'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`form8-archive-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
$('#export-all').onclick=run(async()=>download(await db('archives','getAll')));
$('#import-archive').onchange=run(async event=>{
  const file=event.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('Archive import limit is 20 MB.');
  const archive=JSON.parse(await file.text());if(archive.format!=='form8-archive-v1'||!Array.isArray(archive.records))throw new Error('Unrecognized archive format.');
  for(const record of archive.records){verifyArchive(record);if(!/^[a-f0-9]{32}$/.test(record.meta.id))throw new Error('Invalid archive ID.');await db('archives','put',{...record,id:record.meta.id});}
  await loadArchives();feedback('Archive imported and verified.');
});
$('#radio-settings').oninput=()=>{settingsDirty=true;};
$('#radio-settings').onsubmit=run(async event=>{
  event.preventDefault();const f=event.target;const d={callsign:f.elements.callsign.value.trim().toUpperCase()};
  for(const key of ['primary','backup','bandwidth','sf','cr','power'])d[key]=Number(f.elements[key].value);
  for(const key of ['useBackup','txEnabled','paused'])d[key]=f.elements[key].checked;
  const result=await api('config',d);settingsLoaded=false;settingsDirty=false;await poll();feedback(result.radioReady?'Station settings saved.':'Settings saved; radio initialization failed. Check modem settings.',!result.radioReady);
});
$('#sync-time').onclick=run(async()=>{await api('time',{epoch:Math.floor(Date.now()/1000)});feedback('Radio time updated from this device.');});
async function start() {
  const drafts=(await db('drafts','getAll')).sort((a,b)=>b.savedAt-a.savedAt);fill(drafts[0]?.form);await draftList();await poll();
  if(status)await api('time',{epoch:Math.floor(Date.now()/1000)}).catch(()=>{});
  setInterval(poll,2000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  window.addEventListener('focus',()=>poll());
  if('serviceWorker' in navigator && window.isSecureContext && !globalThis.Form8Native?.isNative())navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
run(start)();
