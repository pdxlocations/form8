import {createLoadingIndicator} from './loading.js';
import {openClientDatabase,claimLegacyClientData,legacyClientDataSummary} from './node-store.js';
import {UnreadTracker,setNavBadge} from './unread.js';
import {guardAction,trackActionControl} from './actions.js';
import {createMapPanel} from './map.js';
import {PositionClient,deviceLocation,locationPayload,validLocation} from './position-client.js';
import {priorities, utf8, token, validateForm, receiptRows, verifyArchive, deliveryStatus, formDeliverySummary, canReplyToForm, canHumanAcknowledge, canResendForm, formReplyDraft, numberUntitledDrafts, draftLabel, hasDraftContent, chatEmojis, validateChatText, chatRadioStatus, chatReactionGroups} from './model.js';
const $ = selector => document.querySelector(selector);
const loading=createLoadingIndicator($('#content-loading'));
const withLoading=(message,work,scope)=>loading.run(message,work,scope);
let status = null, offset = 0, total = 0, draftTimer, locationData = null, locationUnavailable = false, settingsLoaded = false, boundIncident = '';
let draftDefaults={};
let messageNeighbors = {previous:null,next:null};
let selectedForm = null, polling = null, settingsDirty = false, displayedRecord = '';
let openRecord=null, openingForm=null;
const resendingForms=new Set();
const identityRequests=new Map();
const forgettingNodes=new Set();
const deletingIncidents=new Set();
let formSubmitting=false;
let incidentTransition=null;
let retainedIncidents={node:'',incidents:[]};
let timeSyncTarget='',timeSynced=false,timeSyncRetryAt=0;
const form = $('#form8');
let workspaceNode='',workspaceEpoch=0,workspaceSwitching=false;
let database=openClientDatabase();
function waitForLocalStorage(operation,abort=()=>{}) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      reject(new Error('Local draft storage timed out. Close other Form8 tabs and retry. Keep this page open to preserve your message.'));
      try{abort();}catch{}
    },10000);
    Promise.resolve(operation).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}
async function db(store, action, value, targetDatabase=database) {
  const databaseHandle = await waitForLocalStorage(targetDatabase);
  if(store==='drafts' && ['getAll','put','delete'].includes(action))return draftRecords(databaseHandle,action,value);
  const transaction = databaseHandle.transaction(store, action === 'get' || action === 'getAll' ? 'readonly' : 'readwrite');
  return waitForLocalStorage(new Promise((resolve, reject) => {
    const request = transaction.objectStore(store)[action](value);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || new Error('Local save aborted'));
  }),()=>transaction.abort());
}
function draftRecords(databaseHandle,action,value) {
  // Number assignment, draft updates, and counter resets share one transaction
  // so autosave and other browser tabs cannot allocate the same number.
  const transaction=databaseHandle.transaction(['drafts','settings'],'readwrite');
  return waitForLocalStorage(new Promise((resolve,reject)=>{
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
  }),()=>transaction.abort());
}
async function api(path, body) {
  if(workspaceSwitching && path!=='status')throw Object.assign(new Error('Switching radio; wait for its data to load.'),{code:'NODE_CHANGED'});
  const epoch=workspaceEpoch,generation=globalThis.Form8Native?.connectionGeneration?.();
  const check=()=>{if(epoch!==workspaceEpoch || generation!==globalThis.Form8Native?.connectionGeneration?.())throw Object.assign(new Error('Radio changed; previous request cancelled.'),{code:'NODE_CHANGED'});};
  const method = body === undefined ? 'GET' : 'POST';
  const native = globalThis.Form8Native?.isNative();
  if (native) {
    const response = await Form8Native.request({url:`http://192.168.4.1/api/${path}`,method,headers:{'Content-Type':'application/json'},data:body,connectTimeout:6000,readTimeout:15000});
    check();
    const result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (response.status >= 400) throw new Error(result.error || 'Radio request failed');
    return result;
  }
  const response = await fetch(`/api/${path}`, {method, cache:'no-store', headers:body === undefined ? {} : {'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000)});
  const result = await response.json();check();
  if (!response.ok) throw new Error(result.error || 'Radio request failed');
  return result;
}
function feedback(message, error = false) { const e=$('#feedback');delete e.dataset.form;e.hidden=false;e.textContent=message;e.classList.toggle('error',error); }
function refreshFormFeedback(meta) {
  const e=$('#feedback');
  if(e.dataset.form!==`${status?.node}/${meta.id}`)return;
  e.textContent=`Form ${meta.id.slice(-8)} saved to ${status.companionStorage?'companion':'radio'} · ${formDeliverySummary(meta,status)}.`;
  if($('#traffic').hidden===false && $('#message-reader').hidden===false)e.hidden=true;
  if(!formSubmitting)formSendStatus(e.textContent);
}
function run(fn,key) { return guardAction(fn,{key,onError:error=>{if(error.code!=='NODE_CHANGED')feedback(error.message,true);}}); }
function text(tag, value, className) { const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el; }
function button(label, fn, className='secondary',key) { const b=text('button',label,className);b.type='button';b.onclick=run(fn,key);trackActionControl(b,key);return b; }
const mapPanel=createMapPanel({onError:message=>feedback(message,true)});
const positionClient=new PositionClient({post:payload=>api('position',payload),onStatus:message=>{$('#position-status').textContent=message;}});
$('#retry-position').onclick=run(async()=>{await positionClient.retry();await poll();},'device-position');
const unreadTracker=new UnreadTracker();
function updateNavigationBadges(){
  setNavBadge('traffic',status?.unreadMessages||0,'unread forms');
  setNavBadge('incidents',unreadTracker.incidents(status,!document.hidden && !$('#incidents').hidden),'new incidents');
}
function updateChatBadge(messages){
  setNavBadge('chat',unreadTracker.chat(status,messages,!document.hidden && !$('#chat').hidden),'unread texts');
}
function showTab(tab) {
  loading.select(tab);
  if($(`#${tab}`).hidden){
    const message=$('#feedback');message.hidden=true;message.textContent='';message.classList.toggle('error',false);
  }
  for(const e of document.querySelectorAll('main > .panel'))e.hidden=e.id!==tab;
  for(const b of document.querySelectorAll('nav button')){const selected=b.dataset.tab===tab;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
  updateNavigationBadges();
  if(tab==='map')mapPanel.show();if(tab==='nodes')renderNodes();
  if(tab==='chat')run(()=>withLoading('Loading chat…',loadChatMessages,tab))();
  if(tab==='traffic')run(()=>withLoading('Loading messages…',loadTraffic,tab))();
  if(tab==='incidents')run(()=>withLoading('Loading incidents…',loadIncidents,tab))();
  if(tab==='archive')run(()=>withLoading('Loading device archives…',loadArchives,tab))();
}
for(const b of document.querySelectorAll('nav button'))b.onclick=()=>{
  if(b.dataset.tab==='traffic'){
    selectedForm=null;openRecord=null;openingForm=null;displayedRecord='';messageNeighbors={previous:null,next:null};setTrafficView();
  }
  showTab(b.dataset.tab);
};
function values() {
  const d=Object.fromEntries(new FormData(form));d.type='net-form-8';d.priority=Number(d.priority);
  for(const key of ['replySignature','replyDate','replyTime'])if(!d[key])delete d[key];
  d.recipient=d.addressMode==='broadcast'?'*':(d.recipient||'').trim().toUpperCase();delete d.addressMode;
  if(d.lat!=='' && d.lon!=='')d.location={...(locationData||{source:'manual',capturedAt:new Date().toISOString(),fixAgeMs:0}),lat:Number(d.lat),lon:Number(d.lon)};
  if(boundIncident)d.boundIncident=boundIncident;
  delete d.lat;delete d.lon;return d;
}
function draftValues(){return {...values(),lat:form.elements.lat.value,lon:form.elements.lon.value};}
async function saveDraft() {
  if(workspaceSwitching)return;
  const d=draftValues(),defaults={...draftDefaults},epoch=workspaceEpoch,targetDatabase=database,view=workspaceSnapshot(),entered=hasDraftContent(d,defaults);
  if(entered)await db('drafts','put',{id:d.clientToken,form:d,defaults,savedAt:Date.now()},targetDatabase);
  else await db('drafts','delete',d.clientToken,targetDatabase);
  await db('settings','put',view,targetDatabase);
  if(epoch!==workspaceEpoch)return;
  $('#draft-state').textContent=entered?'Saved on this device':'New draft · not saved yet';await draftList();
}
async function draftList() {
  const epoch=workspaceEpoch,drafts=await db('drafts','getAll');if(epoch!==workspaceEpoch)return;
  const list=$('#draft-list');list.replaceChildren();
  for(const draft of drafts.sort((a,b)=>b.savedAt-a.savedAt)){
    const subject=draftLabel(draft),item=text('div','','draft-item');
    const remove=button('Delete',()=>deleteDraft(draft.id,subject),'draft-delete',`draft-delete:${draft.id}`);
    remove.setAttribute('aria-label',`Delete draft: ${subject}`);
    item.append(button(subject,async()=>{await saveDraft();if(epoch!==workspaceEpoch)return;fill(draft.form,draft.defaults);await persistWorkspaceView();},'secondary','draft-editor'),remove);list.append(item);
  }
}
async function deleteDraft(id,subject) {
  const epoch=workspaceEpoch;
  if(!confirm(`Delete draft “${subject}” from this device? This cannot be undone.`))return;
  if(form.elements.clientToken.value===id)clearTimeout(draftTimer);
  await db('drafts','delete',id);
  if(epoch!==workspaceEpoch)return;
  if(form.elements.clientToken.value===id){fill();await persistWorkspaceView();}
  await draftList();feedback('Draft deleted from this device.');
}
function fill(d={},defaults) {
  form.reset();locationUnavailable=false;locationData=d.location||null;boundIncident=d.boundIncident||'';
  $('#compose-approval').open=false;
  for(const [name,value] of Object.entries(d))if(form.elements.namedItem(name) && value!=null && typeof value!=='object')form.elements.namedItem(name).value=value;
  form.elements.clientToken.value=d.clientToken||token();form.elements.addressMode.value=d.recipient && d.recipient!=='*'?'callsign':'broadcast';
  form.elements.recipient.disabled=form.elements.addressMode.value==='broadcast';
  if(d.location){form.elements.lat.value=d.location.lat;form.elements.lon.value=d.location.lon;}
  if(!d.date){const now=new Date();form.elements.date.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;form.elements.time.value=now.toTimeString().slice(0,5);}
  draftDefaults=defaults||{date:form.elements.date.value,time:form.elements.time.value};
  counts();$('#draft-state').textContent=hasDraftContent(draftValues(),draftDefaults)?'Saved on this device':'New draft · not saved yet';
}
function counts() {
  $('#body-count').textContent=`${utf8(form.elements.message.value).length} / 2800 bytes`;
  $('#parent-note').textContent=form.elements.parent.value?`Linked to ${form.elements.parent.value.slice(-8)}`:'';
  $('#compose-reply-note').textContent=form.elements.parent.value?`This response is linked to message ${form.elements.parent.value.slice(-8)}. Write the response in Message above.`:'Use Reply on a received message to send a linked response.';
  const manual=form.elements.lat.value!=='' && form.elements.lon.value!=='' && validLocation({lat:Number(form.elements.lat.value),lon:Number(form.elements.lon.value)});
  $('#location-info').textContent=locationUnavailable?(manual?'Not available from GPS · Manually entered coordinates will be attached.':'Not available · No GPS fix from the node or phone. Enter coordinates manually or try again.'):locationData?`${locationData.source} · captured ${locationData.capturedAt} · fix age ${Math.round((locationData.fixAgeMs||0)/1000)}s at capture`:'Manual coordinates will be attached if both fields are filled.';
  for(const name of ['lat','lon'])form.elements[name].placeholder=locationUnavailable?'Not available':'';
}
form.oninput=()=>{counts();$('#draft-state').textContent='Saving…';clearTimeout(draftTimer);draftTimer=setTimeout(()=>run(saveDraft)(),400);};
form.elements.addressMode.onchange=()=>{form.elements.recipient.disabled=form.elements.addressMode.value==='broadcast';};
for(const name of ['lat','lon'])form.elements[name].addEventListener('input',()=>{locationData=null;counts();});
$('#new-draft').onclick=run(async()=>{const epoch=workspaceEpoch;clearTimeout(draftTimer);await saveDraft();if(epoch!==workspaceEpoch)return;fill();await saveDraft();},'draft-editor');
function formSendStatus(message,busy=false,error=false) {
  for(const selector of ['#form-send-status','#traffic-send-status']){
    const e=$(selector);e.hidden=!message || (selector==='#traffic-send-status' && $('#traffic').hidden===false && $('#message-reader').hidden===false);e.textContent=message;e.classList.toggle('error',error);
    e.classList.toggle('sending',busy);
  }
  const send=$('#form-send');send.disabled=busy||formSubmitting;send.textContent=busy?'Sending…':formSubmitting?'Saved to radio':'Send to radio queue';
  form.setAttribute('aria-busy',String(busy||formSubmitting));
}
form.onsubmit=run(async event=>{
  event.preventDefault();if(formSubmitting)return;
  formSubmitting=true;clearTimeout(draftTimer);
  // Paint feedback before the first storage or radio await, including on Traffic.
  formSendStatus(status?.simulated?'Saving in simulator…':'Sending to radio…',true);
  const target=status?{node:status.node,incident:status.incident,companionStorage:status.companionStorage}:null;
  const targetDatabase=database;
  let confirmed=false;
  try {
    const snapshot=values();await saveDraft();const d=validateForm(snapshot);
    if(!target || target.incident==='0000000000000000')throw new Error('Connect to a radio and join an incident before submitting. Your draft is saved.');
    // Bind before sending; retries retain the same token after an ambiguous response.
    if(d.boundIncident && d.boundIncident!==target.incident)throw new Error('This draft is bound to another incident. Join that incident before submitting.');
    if(status?.node!==target.node || status?.incident!==target.incident)throw new Error('Radio or incident changed. Your draft is saved; reconnect before sending.');
    d.boundIncident=target.incident;await db('drafts','put',{id:d.clientToken,form:d,savedAt:Date.now()},targetDatabase);
    boundIncident=d.boundIncident;
    if(status?.node!==target.node || status?.incident!==target.incident)throw new Error('Radio or incident changed. Your draft is saved; reconnect before sending.');
    const result=await api('forms',d);confirmed=true;
    if(status?.node!==target.node)return;
    const message=status?.simulated?`Form ${result.id.slice(-8)} saved in simulator · no radio transmission.`:`Form ${result.id.slice(-8)} saved to ${target.companionStorage?'companion':'radio'}${status?.paused||!status?.txEnabled?' · radio transmission off':' · awaiting radio ACK'}.`;
    formSendStatus(message);feedback(message);$('#feedback').dataset.form=`${target.node}/${result.id}`;
    await db('drafts','delete',d.clientToken,targetDatabase);
    if(status?.node!==target.node)return;
    fill();await saveDraft();
    if(status?.node===target.node && status?.incident===target.incident){showTab('traffic');await openForm(result.id);await poll();}
  } catch(error) {
    if(status?.node!==target?.node)throw Object.assign(error,{code:'NODE_CHANGED'});
    formSendStatus(confirmed?'Message saved. Could not finish refreshing; refresh Traffic to view it.':`Send not confirmed. Your draft is kept. ${error.message}`,false,true);
    throw error;
  } finally {
    formSubmitting=false;$('#form-send').disabled=false;$('#form-send').textContent='Send to radio queue';form.setAttribute('aria-busy','false');
  }
});
$('#phone-location').onclick=run(async()=>{
  const button=$('#phone-location'),label=button.textContent,epoch=workspaceEpoch;
  button.disabled=true;button.textContent='Getting location…';
  let fixAvailable=false;
  $('#location-info').textContent='Getting current location…';
  try {
    let fix=status?.location;
    if(!fix?.fresh || !validLocation(fix)){
      const position=await deviceLocation();if(epoch!==workspaceEpoch)return;const payload=locationPayload(position);
      fix={...payload,source:'phone',fresh:true};fixAvailable=true;
      if(status && status.companionConnected!==false)await api('position',payload);
    }
    if(epoch!==workspaceEpoch)return;
    fixAvailable=true;locationUnavailable=false;
    const captured=Date.now();locationData={source:fix.source,capturedAt:new Date(captured).toISOString(),fixAgeMs:fix.ageMs||0,accuracy:fix.accuracy};
    form.elements.lat.value=fix.lat;form.elements.lon.value=fix.lon;counts();
    await saveDraft();feedback('Latitude and longitude filled from the current GPS fix.');
  } catch(error) {
    if(epoch!==workspaceEpoch)return;
    if(fixAvailable){counts();throw error;}
    locationUnavailable=true;
    // A failed fresh-fix request must not silently attach an earlier GPS fix.
    // Explicitly entered manual coordinates remain available.
    if(locationData && locationData.source!=='manual'){locationData=null;form.elements.lat.value='';form.elements.lon.value='';}
    counts();await saveDraft();
    const messages={1:'Location permission denied. Allow location access for this app or browser, then try again.',2:'This device could not determine its location. Try again or enter latitude and longitude manually.',3:'Location request timed out. Try again or enter latitude and longitude manually.'};
    throw new Error(`Location not available. ${messages[error.code]||error.message||'No current GPS fix.'}`);
  } finally {
    button.disabled=false;button.textContent=label;
  }
},'device-position');
$('#clear-location').onclick=run(async()=>{locationUnavailable=false;locationData=null;form.elements.lat.value='';form.elements.lon.value='';counts();await saveDraft();});
let chatReply=null, chatIncident='', chatSubmission=null, chatRendered='', chatSending=false, chatVersion='', chatMessages=[],chatAllMessages=[],chatHasOlder=false;
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
  chatReply=null;chatRendered='';chatVersion='';chatMessages=[];chatAllMessages=[];chatHasOlder=false;chatSubmission=null;reactionSubmissions.clear();
  setNavBadge('chat',0,'unread texts');
  $('#chat-load-older').hidden=true;
  $('#chat-list').replaceChildren();
}
$('#chat-text').addEventListener('input',()=>{
  if(!chatIncident || !$('#chat-text').value)chatIncident=status?.incident||'';
  chatSubmission=null;chatControls();run(persistWorkspaceView)();
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
function captureChatScroll(){
  const list=$('#chat-list'),composer=$('#chat-form');
  const writing=composer.contains(document.activeElement);
  const top=$('.chat-toolbar').getBoundingClientRect().bottom;
  return {writing,composerTop:composer.getBoundingClientRect().top,scrollY:window.scrollY,
    atStart:!list.firstElementChild || list.firstElementChild.getBoundingClientRect().top>=top-40,
    anchors:[...list.querySelectorAll('[data-message]')].map(message=>({id:message.dataset.message,rect:message.getBoundingClientRect()}))
      .filter(anchor=>anchor.rect.bottom>top && anchor.rect.top<window.innerHeight)};
}
function restoreChatScroll(saved){
  const list=$('#chat-list');
  if(saved.writing){window.scrollBy(0,$('#chat-form').getBoundingClientRect().top-saved.composerTop);return;}
  if(saved.atStart){window.scrollTo(0,saved.scrollY);return;}
  for(const anchor of saved.anchors){
    const message=[...list.children].find(element=>element.dataset.message===anchor.id);
    if(message){window.scrollBy(0,message.getBoundingClientRect().top-anchor.rect.top);return;}
  }
  window.scrollTo(0,saved.scrollY);
}
$('#chat-oldest').onclick=()=>$('#chat-list').lastElementChild?.scrollIntoView({block:'end',behavior:'smooth'});
const chatLoading=new Map();
function loadChatMessages(){
  const key=`${status?.node||''}:${status?.incident||''}`;
  if(chatLoading.has(key))return chatLoading.get(key);
  const pending=refreshChatMessages().finally(()=>{if(chatLoading.get(key)===pending)chatLoading.delete(key);});
  chatLoading.set(key,pending);return pending;
}
async function refreshChatMessages(){
  const incident=status?.incident,node=status?.node;
  chatControls();
  if(!incident || incident==='0000000000000000'){
    updateChatBadge([]);$('#chat-list').replaceChildren(text('p','Join an incident to chat.','muted'));return;
  }
  const result=await api(`chat${chatVersion?`?since=${encodeURIComponent(chatVersion)}`:''}`);
  if(status?.node!==node || status?.incident!==incident || result.incident!==incident)return;
  if(result.unchanged){result.messages=chatMessages;result.allMessages=chatAllMessages;result.hasOlder=chatHasOlder;}
  else {
    const merged=new Map([...chatMessages,...result.messages].map(message=>[message.id,message]));
    chatMessages=[...merged.values()].sort((a,b)=>a.order-b.order);
    chatAllMessages=result.allMessages||result.messages;chatHasOlder=!!result.hasOlder;chatVersion=result.version||'';
  }
  updateChatBadge(result.allMessages||chatAllMessages);
  if($('#chat').hidden)return;
  renderChatMessages();
}
function renderChatMessages(){
  if($('#chat').hidden)return;
  const incident=status.incident;
  const signature=JSON.stringify([chatMessages,status.node,status.peers]);
  if(signature===chatRendered)return;
  chatRendered=signature;
  $('#chat-load-older').hidden=!chatHasOlder;
  const list=$('#chat-list'),savedScroll=captureChatScroll();
  const opened=new Set([...list.querySelectorAll('details[open]')].map(detail=>detail.dataset.message));
  list.replaceChildren();
  for(const message of [...chatMessages].reverse()){
    const item=text('article','',`chat-message${message.origin===status.node?' chat-own':''}`);item.dataset.message=message.id;
    const heading=text('div','','chat-heading'),date=new Date(message.sentAt*1000);
    heading.append(text('strong',message.sender),text('span',message.sentAt>=1577836800?date.toLocaleString():'Time not synchronized','muted'));item.append(heading);
    if(message.parent){
      const parent=chatMessages.find(candidate=>candidate.id===message.parent);
      item.append(text('blockquote',parent?`${parent.sender}: ${parent.text}`:`Reply to earlier message · ${message.parent.slice(-8)}`,'chat-quote'));
    }
    item.append(text('p',message.text,'chat-body'));
    const actions=text('div','','chat-message-actions');
    for(const group of chatReactionGroups(message,status.node)){
      const reaction=button(`${group.emoji} ${group.count}`,()=>reactToChat(message,group.emoji),`secondary chat-reaction${group.mine?' mine':''}`,`chat-reaction:${status.node}/${message.id}/${group.emoji}`);
      reaction.setAttribute('aria-pressed',String(group.mine));reaction.title=`${group.people.join(', ')}${group.status?` · ${group.status}`:''}`;actions.append(reaction);
    }
    actions.append(button('Reply',()=>{chatReply={id:message.id,sender:message.sender,text:message.text};chatIncident=incident;chatSubmission=null;chatControls();$('#chat-text').focus();}));
    const picker=text('details','','chat-reaction-picker');picker.dataset.message=message.id;picker.open=opened.has(message.id);picker.append(text('summary','React'));
    const palette=text('div','','chat-emojis');
    for(const emoji of chatEmojis){const choice=button(emoji,()=>reactToChat(message,emoji),'secondary',`chat-reaction:${status.node}/${message.id}/${emoji}`);choice.setAttribute('aria-label',`React ${emoji} to ${message.sender}`);palette.append(choice);}
    picker.append(palette);actions.append(picker);
    const footer=text('div','','chat-footer');
    footer.append(actions,text('p',chatRadioStatus(message,status.peers,status.node),'chat-radio-ack'));
    item.append(footer);list.append(item);
  }
  if(!chatMessages.length)list.append(text('p','No chat messages on this radio yet.','muted'));
  restoreChatScroll(savedScroll);
}
async function loadOlderChatMessages(){
  if(!chatHasOlder||!chatMessages.length)return;
  const node=status?.node,incident=status?.incident,before=chatMessages[0].id;
  const result=await api(`chat?before=${encodeURIComponent(before)}`);
  if(status?.node!==node || status?.incident!==incident || result.incident!==incident)return;
  const merged=new Map([...result.messages,...chatMessages].map(message=>[message.id,message]));
  chatMessages=[...merged.values()].sort((a,b)=>a.order-b.order);
  chatAllMessages=result.allMessages||chatAllMessages;chatHasOlder=!!result.hasOlder;chatVersion=result.version||chatVersion;
  updateChatBadge(chatAllMessages);chatRendered='';renderChatMessages();
}
$('#chat-load-older').onclick=run(()=>withLoading('Loading older messages…',loadOlderChatMessages,'chat'));
$('#chat-form').onsubmit=run(async event=>{
  event.preventDefault();validateChatText($('#chat-text').value);chatControls();
  if($('#chat-send').disabled)throw new Error('Connect, join an incident, and review the chat destination before sending.');
  chatIncident=status.incident;
  const payload={type:'chat-message',text:$('#chat-text').value,incident:chatIncident,...(chatReply?{parent:chatReply.id}:{})};
  if(!chatSubmission || chatSubmission.signature!==JSON.stringify(payload))chatSubmission={signature:JSON.stringify(payload),...payload,clientToken:token()};
  const {signature,...submission}=chatSubmission;chatSending=true;chatControls();
  try {
    await api('chat',submission);$('#chat-text').value='';chatReply=null;chatSubmission=null;chatIncident='';
    chatControls();await persistWorkspaceView();
    feedback(`Chat saved to ${status?.companionStorage?'companion':'radio'}. Delivery receipts will appear in Chat.`);await loadChatMessages();
  }finally {chatSending=false;chatControls();}
});
function renderNodes() {
  const list=$('#node-list');list.replaceChildren();if(!status)return;
  const own={id:status.node,callsign:status.callsign,incident:status.incident,name:status.incidentName,own:true};
  const peers=status.peers||[],visible=peers.filter(peer=>!$('#hide-offline-nodes').checked || peer.online);
  $('#nodes-summary').textContent=`${visible.length} other nodes shown${peers.length>visible.length?` · ${peers.length-visible.length} offline hidden`:''}`;
  const nodes=[own,...[...visible].sort((a,b)=>(a.lastHeardAgeMs??Infinity)-(b.lastHeardAgeMs??Infinity))];
  for(const node of nodes){
    const row=text('article','','node-card');
    row.append(text('strong',`${node.callsign||'Callsign unknown'}${node.own?' · This radio':''}`),text('p',`Node ID ${node.id}`,'muted'));
    row.append(text('p',!node.incident||node.incident==='0000000000000000'?'No incident selected':`${node.name||'Incident name unknown'} · Incident ID ${node.incident}`));
    if(node.own){row.append(text('p',status.companionConnected===false?'Disconnected':`Connected · Relaying ${(status.relayEnabled??false)?'on':'off'}`,'muted'));}
    else{
      const age=Number.isFinite(node.lastHeardAgeMs)?Math.max(0,node.lastHeardAgeMs):null;
      const ago=age===null?'Time unavailable':age<1000?'just now':age<60000?`${Math.floor(age/1000)}s ago`:age<3600000?`${Math.floor(age/60000)}m ago`:`${Math.floor(age/3600000)}h ago`;
      const when=age===null?'':` · ${new Date(Date.now()-age).toLocaleString()}`;
      row.append(text('p',`${node.online?'Online':'Offline'} · Last heard ${ago}${when}`,'muted'));
      row.append(text('p',Number.isFinite(node.rssi)&&Number.isFinite(node.snr)?`RSSI ${node.rssi.toFixed(1)} dBm · SNR ${node.snr.toFixed(1)} dB · ${node.relayed?'Forwarded packet · Last hop':'Last hop'}`:'RSSI / SNR unavailable','muted'));
      if(!node.callsign){
        const request=identityRequests.get(`${status.node}/${node.id}`),remaining=request?Math.max(0,Math.ceil((30000-(Date.now()-request.at))/1000)):0;
        const identify=button(request?.busy?'Requesting…':remaining?`Requested · retry in ${remaining}s`:'Request ID',()=>requestNodeIdentity(node.id));
        identify.disabled=!!request?.busy || remaining>0 || status.companionConnected===false || !status.radioReady || !status.txEnabled || status.paused || !status.callsign;
        identify.title='Ask this node to broadcast its callsign and incident. Requires updated firmware and radio transmission on at both ends.';
        row.append(identify);
      }
      const forgetting=forgettingNodes.has(`${status.node}/${node.id}`);
      const forget=button(forgetting?'Forgetting…':'Forget node',()=>forgetNode(node.id));
      forget.disabled=forgetting || status.companionConnected===false;
      forget.title='Clear this heard-node entry on the connected radio. It returns when another packet is heard.';
      row.append(forget);
    }
    list.append(row);
  }
}
async function forgetNode(id){
  const node=status?.node,key=`${node}/${id}`;
  if(!node || id===node || forgettingNodes.has(key))return;
  forgettingNodes.add(key);renderNodes();
  try{
    await api('nodes/forget',{id});
    if(status?.node!==node)return;
    status.peers=(status.peers||[]).filter(peer=>peer.id!==id);
    renderNodes();renderNearbyIncidents();mapPanel.update(status);
    feedback('Node forgotten from this radio’s heard list. It will return when another packet is heard. Messages and saved incidents are kept.');
    await poll();
  }finally{forgettingNodes.delete(key);if(status?.node===node)renderNodes();}
}
$('#hide-offline-nodes').onchange=run(async()=>{
  renderNodes();await db('settings','put',{id:'nodes-hide-offline',value:$('#hide-offline-nodes').checked});
});
async function requestNodeIdentity(id){
  const node=status?.node,key=`${node}/${id}`,existing=identityRequests.get(key);
  if(existing && (existing.busy || Date.now()-existing.at<30000))return;
  for(const [key,request] of identityRequests)if(!request.busy && Date.now()-request.at>=30000)identityRequests.delete(key);
  const request={at:Date.now(),busy:true};identityRequests.set(key,request);renderNodes();
  try{
    await api('nodes/request-id',{id});request.busy=false;
    feedback('ID request queued. Waiting for the node’s callsign announcement. Both radios need transmission on and updated firmware.');
  }catch(error){identityRequests.delete(key);throw error;}
  finally{if(status?.node===node)renderNodes();}
}
function poll() {
  if(polling)return polling;
  polling=refreshScreen().finally(()=>{polling=null;});
  return polling;
}
window.addEventListener('form8-connection-change',()=>{
  ++workspaceEpoch;status=null;positionClient.update(null);mapPanel.update(null);
  for(const selector of ['#traffic-list','#retained','#nearby','#node-list','#form-detail'])$(selector).replaceChildren();
  $('#chat-list').replaceChildren();chatRendered='';
  for(const tab of ['traffic','chat','incidents'])setNavBadge(tab,0,'unread');
  for(const selector of ['#station','#message-status','#queue','#storage','#radio-diagnostics','#board-info'])$(selector).textContent='';
  $('#active-name').textContent='Loading node…';$('#incident-id').textContent='';
  $('#feedback').hidden=true;chatControls();
  $('#connection').textContent='Radio connection changed · loading node data…';
});
async function renderLegacyClientData(){
  const node=workspaceNode,summary=await waitForLocalStorage(legacyClientDataSummary(node));
  if(workspaceNode!==node)return;
  $('#legacy-client-data').hidden=!summary;
  if(summary)$('#legacy-client-summary').textContent=`${summary.drafts} drafts and ${summary.archives} archives from older app versions have no recorded node. They are kept separately until you import them into the correct node's workspace.`;
}
$('#import-legacy-client').onclick=run(async()=>{
  const node=workspaceNode;if(!node || !status)throw Error('Connect to the node that owns the previous data first.');
  if(!confirm(`Assign previous device drafts and archives to ${status.callsign||node} (${node})? Older versions did not record their node. Only do this on the node they belong to. Radio messages are unchanged.`))return;
  await waitForLocalStorage(claimLegacyClientData(node,true));
  if(workspaceNode!==node)return;
  await draftList();await loadArchives();await renderLegacyClientData();
  feedback('Previous drafts and archives imported into this node’s workspace. Open a saved draft in Compose to continue it.');
},'import-legacy-client');
async function persistWorkspaceView(){
  if(workspaceSwitching || !workspaceNode)return;
  await db('settings','put',workspaceSnapshot());
}
function workspaceSnapshot() {
  const settings=$('#radio-settings');
  return {id:'workspace-view',form:draftValues(),formDefaults:{...draftDefaults},chatText:$('#chat-text').value,chatIncident,
    settingsDirty,settings:[...settings.elements].filter(field=>field.name).map(field=>({name:field.name,value:field.value,checked:field.checked})),
    allIncidents:$('#all-incidents').checked,showRemoved:$('#show-removed').checked};
}
async function switchWorkspace(node) {
  clearTimeout(draftTimer);
  const previous=workspaceNode,oldDatabase=database,snapshot=workspaceSnapshot();
  workspaceSwitching=true;
  for(const selector of ['#form8','#radio-settings','#chat-form'])$(selector).inert=true;
  try{
    // Invalidate old replies before waiting on IndexedDB. Keep status until the
    // previous editor has been captured, then clear every radio-specific view.
    ++workspaceEpoch;
    if(previous){
      if(hasDraftContent(snapshot.form,snapshot.formDefaults))await db('drafts','put',{id:snapshot.form.clientToken,form:snapshot.form,defaults:snapshot.formDefaults,savedAt:Date.now()},oldDatabase);
      else await db('drafts','delete',snapshot.form.clientToken,oldDatabase);
      await db('settings','put',snapshot,oldDatabase);
    }
    const nextDatabase=await waitForLocalStorage(claimLegacyClientData(node));
    status=null;settingsLoaded=false;settingsDirty=false;
    offset=0;total=0;selectedForm=null;displayedRecord='';openRecord=null;openingForm=null;
    messageNeighbors={previous:null,next:null};setTrafficView();resetChat();
    chatIncident='';$('#chat-text').value='';chatControls();
    for(const selector of ['#traffic-list','#retained','#nearby','#archive-list','#draft-list','#node-list'])$(selector).replaceChildren();
    $('#feedback').hidden=true;delete $('#feedback').dataset.form;formSendStatus('');
    $('#all-incidents').checked=false;$('#show-removed').checked=false;
    positionClient.update(null);mapPanel.update(null);fill();
    database=Promise.resolve(nextDatabase);workspaceNode=node;
    try{localStorage.setItem('form8-client-node',node);}catch{}
    const view=await db('settings','get','workspace-view');
    const drafts=(await db('drafts','getAll')).sort((a,b)=>b.savedAt-a.savedAt);
    fill(view?.form||drafts[0]?.form,view?.form?view.formDefaults:drafts[0]?.defaults);
    $('#chat-text').value=view?.chatText||'';chatIncident=view?.chatIncident||'';
    $('#all-incidents').checked=!!view?.allIncidents;$('#show-removed').checked=!!view?.showRemoved;
    $('#hide-offline-nodes').checked=(await db('settings','get','nodes-hide-offline'))?.value===true;
    if(view?.settingsDirty){
      for(const field of view.settings||[]){const input=$('#radio-settings').elements.namedItem(field.name);if(input){input.value=field.value;input.checked=field.checked;}}
      settingsDirty=true;settingsLoaded=true;
    }
    await draftList();if(!$('#archive').hidden)await loadArchives();
    await renderLegacyClientData();
  }finally{workspaceSwitching=false;for(const selector of ['#form8','#radio-settings','#chat-form'])$(selector).inert=false;}
}
function radioClockKey(next){return `${next.node||''}:${next.bootSession??''}`;}
async function syncRadioTime(next,reconnected){
  if(next.companionConnected===false){timeSynced=false;timeSyncTarget='';return;}
  const key=radioClockKey(next);
  if(reconnected || key!==timeSyncTarget){timeSyncTarget=key;timeSynced=false;timeSyncRetryAt=0;}
  if(next.clockSource==='unsynchronized' && timeSynced){timeSynced=false;timeSyncRetryAt=0;}
  if(timeSynced || Date.now()<timeSyncRetryAt)return;
  const warning='Connected, but radio time could not sync. Retrying automatically.';
  try {
    await api('time',{epoch:Math.floor(Date.now()/1000)});
    timeSynced=true;next.clockSource='phone/laptop';
    if($('#feedback').textContent===warning)$('#feedback').hidden=true;
  }catch(error){
    timeSyncRetryAt=Date.now()+10000;
    feedback(warning,true);
  }
}
async function refreshScreen() {
  try {
    const generation=globalThis.Form8Native?.connectionGeneration?.();
    const next=await api('status');
    const reconnected=!status;
    if(next.node!==workspaceNode)await switchWorkspace(next.node);
    if(generation!==globalThis.Form8Native?.connectionGeneration?.())return false;
    if(status && (status.node!==next.node || status.incident!==next.incident)){offset=0;selectedForm=null;displayedRecord='';openRecord=null;openingForm=null;setTrafficView();resetChat();}
    status=next;incidentTransitionControls();updateNavigationBadges();for(const b of document.querySelectorAll('[data-announce]'))b.disabled=!canAnnounce();
    positionClient.update(next.companionConnected===false?null:next);mapPanel.update(next);renderNodes();
    chatControls();
    $('#connection').textContent=next.companionConnected===false?'Radio disconnected · companion data available':next.simulated?'Simulation · no RF':next.paused||!next.txEnabled?'Connected · Radio transmission off':'Connected to radio';
    await syncRadioTime(next,reconnected);
    if(status!==next)return false;
    $('#active-name').textContent=next.incidentName||'Choose an incident';
    $('#compose-incident').value=next.incidentName||(next.incident==='0000000000000000'?'Choose an incident':next.incident);
    $('#incident-id').textContent=next.incident==='0000000000000000'?'No incident selected':`Incident ID ${next.incident}`;
    $('#radio-diagnostics').textContent=`RX packets ${next.rxPackets||0} · Valid frames ${next.rxFrames||0} · TX frames ${next.txFrames||0} · RX errors ${next.rxErrors||0} · Last RX error ${next.lastRxError||0} · Dropped from queue ${next.dropped||0}${next.receiveError?` · ${next.receiveError}`:''}`;
    $('#station').textContent=`${next.callsign||'Callsign not set'} · ${next.frequency.toFixed(3)} MHz · ${next.peers.filter(p=>p.online&&p.incident===next.incident&&next.incident!=='0000000000000000').length} nearby incident nodes · ${next.peers.filter(p=>p.online).length} nodes heard`;
    $('#message-status').textContent=`${next.unreadMessages||0} unread · ${next.outgoingMessages||0} awaiting radio ACK`;
    $('#storage').textContent=`${(next.storageUsed/1048576).toFixed(1)} / ${(next.storageTotal/1048576).toFixed(1)} MB${next.companionStorage?' · companion storage':''}`;
    $('#queue').textContent=`${next.queue} queue items`;
    $('#warning').hidden=!next.storageWarning && next.fsReady && next.radioReady;
    $('#warning').textContent=!next.fsReady?(next.companionStorage?'Radio settings storage is unavailable. Reconnect and check the radio firmware; nRF radios do not use filesystem uploads.':'Radio storage unavailable. Upload the filesystem image only for first setup; do not overwrite existing messages.'):next.companionConnected===false?'Radio disconnected. Data stays on this companion; reconnect to send or receive.':!next.radioReady?`Radio initialization failed (${next.radioError}).`: 'Storage is nearly full. Archive messages, or remove an old incident to free its message slots.';
    $('#board-info').textContent=`${next.board} · ${next.band.toUpperCase()} profile · ${next.clockSource}${Number.isFinite(next.batteryPercent)?` · Battery ~${next.batteryPercent}%`:next.batteryMillivolts>0?` · Battery ${(next.batteryMillivolts/1000).toFixed(2)} V`: ""}${next.powerNote?` · ${next.powerNote}`:''}`;
    const powerMin=next.powerMin??2,powerMax=next.powerMax??(next.band==='vhf'?10:20);
    const powerField=$('#radio-settings').elements.power;powerField.min=powerMin;powerField.max=powerMax;
    $('#tx-power-label').textContent=`${next.powerIsDrive?'TX chip drive':'TX power'} · dBm (${powerMin}–${powerMax})`;
    $('#tx-power-help').textContent=next.powerIsDrive?'Heltec V4 adds external amplification; this value is the SX1262 chip setting, not final antenna output.':'';
    $('#tx-power-help').hidden=!next.powerIsDrive;
    if(!settingsLoaded || !settingsDirty){
      const f=$('#radio-settings');for(const key of ['callsign','primary','backup','bandwidth','sf','cr','power'])f.elements[key].value=String(next[key]);
      for(const key of ['useBackup','relayEnabled'])f.elements[key].checked=key==='relayEnabled'?(next[key]??false):next[key];
      f.elements.transmission.checked=next.txEnabled&&!next.paused;
      f.elements.positionEnabled.checked=next.positionEnabled??true;f.elements.positionMinutes.value=String((next.positionInterval||600)/60);
      settingsLoaded=true;
    }
    renderNearbyIncidents();
    const updates=[];
    const tracked=$('#feedback').dataset.form;
    if(tracked?.startsWith(`${next.node}/`)){
      const id=tracked.slice(next.node.length+1);
      if(selectedForm!==id || $('#traffic').hidden)updates.push(api(`form?id=${id}`).then(record=>refreshFormFeedback(record.meta)));
    }
    if(!$('#traffic').hidden){
      updates.push(loadTraffic());
      if(selectedForm && !openRecord && !openingForm){const id=selectedForm;updates.push(api(`form?id=${id}`).then(record=>{if(selectedForm===id)renderForm(record);}));}
    }
    updates.push(loadChatMessages());
    if(!$('#incidents').hidden)updates.push(loadRetainedIncidents());
    const results=await Promise.allSettled(updates);
    if(results.some(result=>result.status==='rejected')){feedback('Some displayed data could not refresh. Retrying automatically.',true);return false;}
    return true;
  }catch(error){status=null;positionClient.update(null);$('#connection').textContent='Radio disconnected · drafts available';return false;}
}
function renderReceipts(m) {
  const container=$('#delivery-detail');if(!container)return;
  container.replaceChildren();
  const table=document.createElement('table');table.className='receipt-matrix';
  const head=document.createElement('tr');for(const title of ['Station','Radio','Human']){const th=text('th',title);th.setAttribute('scope','col');head.append(th);}table.append(head);
  for(const r of receiptRows(m,status?.peers||[],status?.node,true)){
    const tr=document.createElement('tr'),kind=r.origin?'origin':r.received?'radio':r.online?'pending':'offline';
    tr.append(text('td',r.id===status?.node&&!r.origin?(status.callsign||r.callsign):r.callsign),text('td',r.origin?'Origin':r.received?'Received':r.online?'Pending':'Pending · offline',`receipt-${kind}`),text('td',r.human?'Acknowledged':'—',r.human?'receipt-human':'receipt-none'));table.append(tr);
  }
  container.append(table);
}
async function loadTraffic() {
  const node=status?.node,epoch=workspaceEpoch,selected=selectedForm,all=$('#all-incidents').checked;
  const result=await api(`forms?offset=${offset}${all?'&all=1':''}${$('#show-removed').checked?'&history=1':''}${selected?`&selected=${selected}`:''}`);
  if(epoch!==workspaceEpoch || status?.node!==node || selected!==selectedForm || all!==$('#all-incidents').checked)return;
  total=result.total;offset=result.offset;
  if(selected && openRecord?.meta.id===selected){
    const meta=result.forms.find(m=>m.id===selected);
    if(meta && meta.hash===openRecord.meta.hash && (meta.state!=='stored' || openRecord.body))renderForm({meta,body:meta.state==='stored'?openRecord.body:undefined});
    else {const record=await api(`form?id=${selected}`);if(selectedForm===selected)renderForm(record);}
  }
  messageNeighbors={previous:result.previous||null,next:result.next||null};renderMessageNavigation();
  const list=$('#traffic-list');list.replaceChildren();
  for(const m of result.forms){
    const row=text('div','','traffic-item'),description=text('div','');
    const heading=text('div','','traffic-subject');
    heading.append(text('span',priorities[m.priority],'badge'+(m.priority===3?' urgent':'')),button(m.subject||'(No subject)',()=>openForm(m.id,m),'traffic-open',`open-form:${status?.node}/${m.id}`));
    if(m.unread)heading.append(text('span','Unread','badge'));
    description.append(heading,text('p',`From: ${m.from||'—'} · To: ${m.to||'—'}`,'traffic-addresses'),text('p',`${m.sender} → ${m.recipient==='*'?'Broadcast':m.recipient} · ${m.state}`));
    const incoming=!!m.origin && m.origin!==status?.node;
    const receiptPeers=incoming?[...(status?.peers||[]),{id:status?.node,callsign:status?.callsign,online:true}]:status?.peers||[];
    // For received forms, this node's durable receipt is real ACK evidence.
    // Outgoing forms still need a receipt from another node.
    const delivery=deliveryStatus(m,receiptPeers,status?.node,incoming);
    const radioAck=delivery.complete||delivery.radio?.length>0;
    const recipientPending=radioAck&&!delivery.complete&&m.recipient&&m.recipient!=='*';
    const human=delivery.human||[];
    const ackLabel=human.length?`Human ACK: ${human.join(', ')}`:radioAck?'Radio ACK':'Pending ACK';
    const receipt=text('span',status?.simulated?'Simulation':ackLabel+(recipientPending?' · recipient pending':''),'traffic-receipt'+(!status?.simulated&&radioAck?' acked':'')+(!status?.simulated&&human.length?' human-acked':''));
    receipt.title=status?.simulated?'Saved in simulator · no radio transmission':delivery.label+(human.length?` · Human ACK: ${human.join(', ')}`:'')+(recipientPending?` · Awaiting recipient ACK: ${m.recipient}`:'');
    const actions=text('div','','traffic-actions');actions.append(button('Open',()=>openForm(m.id,m),'secondary',`open-form:${status?.node}/${m.id}`));
    if(m.state==='stored')actions.append(messageCleanupButton('Archive',m,archiveMessage),messageCleanupButton('Remove…',m,removeMessage,'danger'));
    row.append(description,receipt,actions);list.append(row);
  }
  if(!result.forms.length)list.append(text('p','No forms in this view.','muted'));
  $('#page-label').textContent=`${total?offset+1:0}–${Math.min(offset+20,total)} of ${total}`;
  $('#previous-page').disabled=offset===0;$('#next-page').disabled=offset+20>=total;
}
async function openForm(id,meta) {
  const node=status?.node,request={id,node};
  selectedForm=id;openRecord=null;openingForm=request;displayedRecord='';messageNeighbors={previous:null,next:null};
  $('#message-subject').textContent=meta?.subject||'Loading…';$('#message-id').textContent=`Message ID ${id}`;
  setTrafficView();$('#form-detail').replaceChildren(text('p','Loading message…','loading-message'));$('#form-detail').hidden=false;
  $('#form-detail').setAttribute('aria-busy','true');$('#message-reader').scrollIntoView?.({block:'start'});
  try{
    const record=await api(`form?id=${id}`);
    if(selectedForm!==id || status?.node!==node || openingForm!==request)return;
    $('#form-detail').setAttribute('aria-busy','false');
    renderForm(record); // Show the form before waiting for its durable read marker.
    try{await api('read',{id});}catch(error){throw new Error(`Message opened, but its read status could not be saved: ${error.message}`);}
    if(selectedForm!==id || status?.node!==node)return;
    await poll();
  }catch(error){
    if(selectedForm!==id || status?.node!==node)return;
    if(!openRecord)$('#form-detail').replaceChildren(text('p','Could not open this message. Use Back and try again.','muted'));
    throw error;
  }finally{if(openingForm===request){openingForm=null;$('#form-detail').setAttribute('aria-busy','false');}}
}
async function replyToForm(record) {
  const epoch=workspaceEpoch;
  try {
    const draft=formReplyDraft(record,status);
    clearTimeout(draftTimer);
    await saveDraft();
    if(epoch!==workspaceEpoch)return;
    fill(draft);
    showTab('compose');
    form.scrollIntoView({block:'start'});
    form.elements.message.focus({preventScroll:true});
    await saveDraft();
    feedback(`Reply to ${draft.recipient} · linked to ${record.meta.id.slice(-8)}. Enter your response and send it.`);
  } catch(error) {
    feedback(`Cannot prepare reply: ${error.message}`,true);
    $('#feedback').scrollIntoView({block:'center'});
  }
}
function renderForm(record) {
  openRecord=record;
  refreshFormFeedback(record.meta);
  setTrafficView();
  const signature=JSON.stringify({record,canResend:canResendForm(record.meta,status),resending:resendingForms.has(record.meta.id)});
  if(signature===displayedRecord){renderReceipts(record.meta);return;}
  const approvalOpen=!!displayedRecord && $('#form-detail .paper-approval')?.open;
  displayedRecord=signature;
  const m=record.meta,id=m.id,detail=$('#form-detail');detail.replaceChildren();detail.hidden=false;
  $('#message-subject').textContent=m.subject||'General message';$('#message-id').textContent=`Message ID ${m.id}`;
  if(record.body){
    const d=JSON.parse(record.body);
    const sheet=text('div','','paper-form received-form');
    const field=(label,value,layout='',message=false)=>{
      const cell=text('div','','paper-field received-field'+(layout?' '+layout:''));
      cell.append(text('span',label,'received-field-label'),text(message?'pre':'p',value||'—',message?'message':'received-field-value'));
      return cell;
    };
    sheet.append(field('1. Incident name',d.incidentName||d.incident||m.incident),
      field('2. To · name and position',d.to||d.recipient),field('3. From · name and position',d.from||d.sender),
      field('4. Subject',`${priorities[d.priority??m.priority]||'Routine'}: ${d.subject||m.subject||'—'}`,'paper-subject'),field('5. Date',d.date,'paper-date'),field('6. Time · local',d.time,'paper-time'),
      field('7. Message / 9. Reply',d.message,'',true));
    const approval=text('details','','paper-field paper-approval');approval.open=!!approvalOpen;
    const approvalFields=text('div','','approval-fields');
    approvalFields.append(field('Name',d.approvedBy),field('Signature',d.signature),field('Position / title',d.approvedPosition));
    approval.append(text('summary','8. Approved by'),approvalFields);sheet.append(approval);
    const reply=field('9. Reply',d.parent?`Reply/correction linked to ${d.parent}`:'Replies are sent as linked messages.');
    if(canReplyToForm(m,status))reply.append(button('Reply',()=>replyToForm(record),'secondary','draft-editor'));
    sheet.append(reply,field('10. Replied by · name',d.replyBy,'paper-third'),field('Position / title',d.replyPosition,'paper-third'),field('Signature',d.replySignature,'paper-third'),
      field('','ICS 213','paper-third paper-form-code'),field('Reply date',d.replyDate,'paper-third'),field('Reply time · local',d.replyTime,'paper-third'));
    if(d.location)sheet.append(field('Location',`${d.location.lat}, ${d.location.lon} · ${d.location.source} · fix age ${d.location.fixAgeMs||0} ms`));
    detail.append(sheet);
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
    },'acknowledge-button',`human-ack:${status?.node}/${id}`);
    acknowledge.disabled=acknowledged;
    if(canHumanAcknowledge(m,status))actions.append(acknowledge);
    if(m.origin===status?.node){
      const resend=button(resendingForms.has(id)?'Resending…':'Resend',async()=>{
        if(resendingForms.has(id))return;
        resendingForms.add(id);resend.disabled=true;resend.textContent='Resending…';
        try{await api('resend',{id});feedback('Original message queued for resend. Existing receipts are kept.');await poll();}
        finally{resendingForms.delete(id);resend.textContent='Resend';resend.disabled=!canResendForm(m,status);}
      });
      resend.disabled=!canResendForm(m,status)||resendingForms.has(id);
      resend.title='Resend the original form with the same ID and contents. Join its incident and turn Radio transmission On first.';
      actions.append(resend);
    }
    actions.append(button('Correction',async()=>{
      const epoch=workspaceEpoch;await saveDraft();if(epoch!==workspaceEpoch)return;const corrected={...d,clientToken:token(),parent:id,subject:`Correction: ${d.subject||''}`.slice(0,160)};delete corrected.boundIncident;fill(corrected);await saveDraft();showTab('compose');
    },'secondary','draft-editor'));detail.append(actions);
    const storage=text('section','','message-storage');storage.append(text('h4','Archive or remove'),text('p',`Archive keeps a verified copy on this device. Remove takes the message out of Traffic on ${localStoreName()}. Other nodes keep their copies.`,'muted'));
    const cleanup=text('div','','actions');
    cleanup.append(messageCleanupButton('Archive on this device',m,archiveMessage),messageCleanupButton('Remove message…',m,removeMessage,'danger'));storage.append(cleanup);detail.append(storage);
  }else {
    detail.append(text('p',m.state==='archived'?'This message was archived on the device that saved it. Its body has been removed from Traffic.':'This message was removed locally. Other nodes may still have a copy.','muted'));
    if(m.state==='archived')detail.append(button('Open device archive',()=>showTab('archive')));
  }
  const delivery=text('div','','message-receipts');delivery.id='delivery-detail';delivery.setAttribute('aria-live','polite');detail.append(delivery);renderReceipts(m);
}
const messageCleanupPending=new Set();
function messageCleanupButton(label,meta,action,kind='secondary'){
  const control=button(label,async()=>{
    control.disabled=true;try{await action(meta);}finally{control.disabled=messageCleanupPending.has(meta.id);}
  },kind);
  control.disabled=messageCleanupPending.has(meta.id);return control;
}
async function refreshAfterMessageCleanup(id){
  if(offset>0 && offset>=total-1)offset=Math.max(0,offset-20);
  if(selectedForm===id)await backToTraffic();else await loadTraffic();
  await poll();
}
async function archiveMessage(meta){
  if(messageCleanupPending.has(meta.id))return;
  messageCleanupPending.add(meta.id);const node=status?.node,targetDatabase=database;
  try{
    if(!confirm(`Archive “${meta.subject||'this message'}” on this device and remove it from Traffic on ${localStoreName()}? Other nodes keep their copies.`))return;
    const record=await api(`form?id=${meta.id}`);
    if(record.meta?.id!==meta.id || typeof record.body!=='string')throw new Error('This message changed or was already removed. Refresh Traffic and try again.');
    verifyArchive(record);
    await db('archives','put',{...record,id:meta.id,archivedAt:Date.now()},targetDatabase);
    verifyArchive(await db('archives','get',meta.id,targetDatabase));
    if(status?.node!==node)throw new Error('Connection changed. The archive was kept, but the original message was not removed.');
    await api('offload',{id:meta.id,mode:'archive',hash:record.meta.hash,verified:true});
    await refreshAfterMessageCleanup(meta.id);feedback('Saved in Archive on this device and removed from Traffic.');
  }finally{messageCleanupPending.delete(meta.id);}
}
async function removeMessage(meta){
  if(messageCleanupPending.has(meta.id))return;
  messageCleanupPending.add(meta.id);
  try{
    if(!confirm(`Remove “${meta.subject||'this message'}” from ${localStoreName()} without saving an archive? This cannot be undone here. Other nodes and existing archives keep their copies.`))return;
    await api('offload',{id:meta.id,mode:'discard'});
    await refreshAfterMessageCleanup(meta.id);feedback(`Message removed from ${localStoreName()}. Other nodes and saved archives are unchanged.`);
  }finally{messageCleanupPending.delete(meta.id);}
}
function localStoreName(){return status?.companionStorage?'this app':'this node';}
function setTrafficView() {
  const reading=!!selectedForm;
  $('#traffic-overview').hidden=reading;$('#message-reader').hidden=!reading;
  $('#form-detail').hidden=!reading;$('#traffic-list-header').hidden=reading;
  if(reading){$('#traffic-send-status').hidden=true;if($('#feedback').dataset.form)$('#feedback').hidden=true;}
  renderMessageNavigation();
}
function renderMessageNavigation() {
  $('#previous-message').hidden=!selectedForm || !messageNeighbors.previous;
  $('#next-message').hidden=!selectedForm || !messageNeighbors.next;
}
async function backToTraffic() {
  selectedForm=null;openRecord=null;openingForm=null;displayedRecord='';messageNeighbors={previous:null,next:null};setTrafficView();await loadTraffic();
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
  if(!$(`#${tab}`).hidden)feedback('Data refreshed. Unsaved edits kept.');
}
for(const refresh of document.querySelectorAll('[data-refresh]'))refresh.onclick=run(async()=>{
  const label=refresh.textContent;refresh.disabled=true;refresh.textContent='Refreshing…';
  try {await withLoading('Refreshing data…',()=>refreshData(refresh.dataset.refresh),refresh.dataset.refresh);}finally{refresh.disabled=false;refresh.textContent=label;}
});
$('#all-incidents').onchange=$('#show-removed').onchange=run(async()=>{offset=0;await persistWorkspaceView();await withLoading('Loading messages…',loadTraffic,'traffic');});
$('#previous-page').onclick=run(async()=>{offset=Math.max(0,offset-20);await withLoading('Loading messages…',loadTraffic,'traffic');});$('#next-page').onclick=run(async()=>{offset+=20;await withLoading('Loading messages…',loadTraffic,'traffic');});
async function joinIncident(name,id) {
  if(incidentTransition || deletingIncidents.size)return false;
  incidentTransition={kind:id?'join':'create',id};incidentTransitionControls();
  feedback(id?`Joining ${name}…`:`Creating and joining ${name}…`);
  try{await api('incident',{name,id});await poll();await loadIncidents();feedback(`Joined ${name}. Previous incident traffic is paused.`);return true;}
  finally{incidentTransition=null;incidentTransitionControls();}
}
$('#create-incident').onsubmit=run(async event=>{event.preventDefault();if(await joinIncident(event.target.elements.name.value))event.target.reset();},'incident-membership');
async function loadIncidents() {
  await poll();renderNearbyIncidents();await loadRetainedIncidents();
}
async function loadRetainedIncidents() {
  const result=await api('incidents');retainedIncidents={node:status?.node,incidents:result.incidents};renderNearbyIncidents();
}
function incidentTransitionControls(only){
  const working=!!incidentTransition || deletingIncidents.size>0;
  for(const control of only?[only]:document.querySelectorAll('[data-incident-action]')){
    trackActionControl(control,'incident-membership');
    const action=control.dataset.incidentAction;
    control.disabled=working || status?.companionConnected===false;
    const selected=incidentTransition?.kind===action && (action!=='join'||incidentTransition.id===control.dataset.incident);
    control.textContent=selected?(action==='join'?'Joining…':action==='leave'?'Leaving…':'Creating…'):(action==='join'?'Join':action==='leave'?'Leave':'Create and join');
  }
  if(!only){incidentDeleteControls();for(const control of document.querySelectorAll('[data-announce]'))control.disabled=!canAnnounce();}
}
function canAnnounce(){return !!(!incidentTransition && status?.incident && status.incident!=='0000000000000000' && status.txEnabled && !status.paused && status.radioReady && status.companionConnected!==false);}
async function announceIncident(){
  if(!canAnnounce())throw new Error('Join an incident and set Radio transmission to On before announcing it.');
  await api('incident/announce',{});feedback('Incident announcement queued for radio transmission.');
}
for(const b of document.querySelectorAll('[data-announce]'))b.onclick=run(announceIncident,'incident-announce');
async function leaveIncident(){
  if(incidentTransition || deletingIncidents.size)return;
  if(!confirm('Leave the active incident? Transmission and relaying for it stop. Saved messages stay available under previous incidents.'))return;
  incidentTransition={kind:'leave'};incidentTransitionControls();feedback(`Leaving ${status?.incidentName||'incident'}…`);
  try{await api('incident/leave',{});await poll();await loadRetainedIncidents();feedback('Incident left. Saved messages are still available under previous incidents.');}
  finally{incidentTransition=null;incidentTransitionControls();}
}
function incidentDeleteControls(){
  for(const control of document.querySelectorAll('[data-delete-incident]')){
    const id=control.dataset.deleteIncident,working=deletingIncidents.has(`${status?.node}/${id}`);
    control.disabled=!!incidentTransition || working || (status?.incident===id && status?.companionConnected===false);
    control.textContent=working?'Deleting…':'Delete incident & messages…';
  }
  const active=$('#delete-active-incident');
  active.disabled=!!incidentTransition || !status || !status.incident || status.incident==='0000000000000000' || status.companionConnected===false || deletingIncidents.has(`${status.node}/${status.incident}`);
  active.textContent=deletingIncidents.has(`${status?.node}/${status?.incident}`)?'Deleting…':'Delete active incident & messages…';
}
async function removeIncident(name,id){
  const node=status?.node,key=`${node}/${id}`;
  if(!node || incidentTransition || deletingIncidents.has(key))return;
  const leaving=status.incident===id?'You will also leave this incident. ':'';
  if(!confirm(`Delete “${name}” and ALL of its stored forms, receipts, chat messages, replies, and reactions from ${localStoreName()}? ${leaving}This cannot be undone. Export anything you want to keep first. Drafts and archived copies on this device, and other nodes’ copies, are kept.`))return;
  deletingIncidents.add(key);incidentTransitionControls();
  try{
    const result=await api('incident/remove',{id});
    if(status?.node!==node)return;
    selectedForm=null;openRecord=null;openingForm=null;displayedRecord='';messageNeighbors={previous:null,next:null};offset=0;setTrafficView();
    await poll();await loadRetainedIncidents();
    feedback(`Incident deleted from ${localStoreName()}: ${result.forms??0} forms and ${result.chatEvents??0} chat events removed. Other nodes keep their copies.`);
  }finally{deletingIncidents.delete(key);incidentTransitionControls();}
}
$('#delete-active-incident').onclick=run(async()=>{if(status?.incident && status.incident!=='0000000000000000')await removeIncident(status.incidentName||status.incident,status.incident);});
function appendIncident(container,name,id,saved=false) {
  const row=text('div','','incident-item'),actions=text('div','','actions incident-actions');
  const identity=text('div','','incident-identity'),heading=text('div','','incident-heading');
  heading.append(text('strong',name||'Unnamed incident','incident-name'));
  if(id===status?.incident)heading.append(text('span','Active','badge'));
  identity.append(heading,text('p',`Incident ID ${id}`,'incident-id'));row.append(identity);
  if(id===status?.incident){if(saved){const announce=button('Announce',announceIncident,'secondary','incident-announce');announce.disabled=!canAnnounce();const leave=button('Leave',leaveIncident,'secondary','incident-membership');leave.dataset.incidentAction='leave';incidentTransitionControls(leave);actions.append(announce,leave);}}
  else {const join=button('Join',()=>joinIncident(name,id),'secondary','incident-membership');join.dataset.incidentAction='join';join.dataset.incident=id;incidentTransitionControls(join);actions.append(join);}
  if(saved){const remove=button(deletingIncidents.has(`${status?.node}/${id}`)?'Deleting…':'Delete incident & messages…',()=>removeIncident(name,id),'danger');remove.dataset.deleteIncident=id;remove.disabled=deletingIncidents.has(`${status?.node}/${id}`) || (status?.incident===id && status?.companionConnected===false);actions.append(remove);}
  row.append(actions);container.append(row);
}
function renderNearbyIncidents() {
  const nearby=$('#nearby'),retained=$('#retained');nearby.replaceChildren();retained.replaceChildren();const seen=new Set();
  const saved=retainedIncidents.node===status?.node?retainedIncidents.incidents:[],savedIds=new Set(saved.map(i=>i.id));
  for(const peer of status?.peers||[])if(peer.online&&peer.incident!=='0000000000000000'&&!seen.has(peer.incident)){seen.add(peer.incident);appendIncident(nearby,peer.name,peer.incident,savedIds.has(peer.incident));}
  for(const incident of saved)if(!seen.has(incident.id))appendIncident(retained,incident.name,incident.id,true);
  if(!seen.size)nearby.append(text('p','No nearby incidents advertised yet.','muted'));
  if(!retained.children.length)retained.append(text('p','No other saved incidents.','muted'));
}
async function loadArchives() {
  const epoch=workspaceEpoch,records=await db('archives','getAll');if(epoch!==workspaceEpoch)return;
  const list=$('#archive-list');list.replaceChildren();
  for(const record of records){
    const row=text('div','','archive-item');row.append(text('div',`${record.meta.subject||'General message'} · ${record.meta.incident}`),button('Read',()=>{if(row.querySelector('pre.message'))return;const d=JSON.parse(record.body);const pre=text('pre',d.message,'message');row.append(pre);}),button('Export',()=>download([record]),'secondary',`archive-export:${record.id}`),button('Delete archive…',async()=>{
      if(!confirm('Delete this archived copy from this device? The copy on this device will be lost. Other nodes and stored traffic are unchanged.'))return;
      await db('archives','delete',record.id);await loadArchives();feedback('Archived copy deleted from this device.');
    },'danger',`archive-delete:${record.id}`));list.append(row);
  }
  if(!list.children.length)list.append(text('p','No archived forms on this device.','muted'));
}
async function download(records) {
  const blob=new Blob([JSON.stringify({format:'form8-archive-v1',records},null,2)],{type:'application/json'});
  const filename=`form8-archive-${new Date().toISOString().slice(0,10)}.json`;
  if(globalThis.Form8Native?.saveFile){await Form8Native.saveFile(blob,filename);return;}
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
$('#export-all').onclick=run(async()=>download(await db('archives','getAll')));
$('#import-archive').onchange=run(async event=>{
  const targetDatabase=database,epoch=workspaceEpoch;
  const file=event.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('Archive import limit is 20 MB.');
  const archive=JSON.parse(await file.text());if(archive.format!=='form8-archive-v1'||!Array.isArray(archive.records))throw new Error('Unrecognized archive format.');
  for(const record of archive.records){verifyArchive(record);if(!/^[a-f0-9]{32}$/.test(record.meta.id))throw new Error('Invalid archive ID.');await db('archives','put',{...record,id:record.meta.id},targetDatabase);}
  if(epoch===workspaceEpoch){await loadArchives();feedback('Archive imported and verified.');}
});
$('#radio-settings').oninput=()=>{settingsDirty=true;run(persistWorkspaceView)();};
$('#radio-settings').onsubmit=run(async event=>{
  event.preventDefault();const f=event.target;const d={callsign:f.elements.callsign.value.trim().toUpperCase()};
  for(const key of ['primary','backup','bandwidth','sf','cr','power'])d[key]=Number(f.elements[key].value);
  for(const key of ['useBackup','relayEnabled'])d[key]=f.elements[key].checked;
  // Keep older radio APIs compatible while clearing their legacy pause override.
  d.txEnabled=f.elements.transmission.checked;d.paused=false;
  d.positionEnabled=f.elements.positionEnabled.checked;d.positionInterval=Number(f.elements.positionMinutes.value)*60;
  const result=await api('config',d);settingsLoaded=false;settingsDirty=false;await poll();feedback(result.radioReady?'Station settings saved.':'Settings saved; radio initialization failed. Check modem settings.',!result.radioReady);
});
async function start() {
  $('#hide-offline-nodes').checked=(await db('settings','get','nodes-hide-offline'))?.value===true;
  fill();
  let remembered;try{remembered=localStorage.getItem('form8-client-node');}catch{}
  if(/^[a-f0-9]{16}$/.test(remembered||''))await switchWorkspace(remembered);
  await poll();
  setInterval(poll,2000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  window.addEventListener('focus',()=>poll());
  if('serviceWorker' in navigator && window.isSecureContext && !globalThis.Form8Native?.isNative())navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
run(()=>withLoading('Connecting to radio…',start))();
