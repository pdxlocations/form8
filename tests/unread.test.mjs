import test from 'node:test';
import assert from 'node:assert/strict';
import {UnreadTracker,setNavBadge} from '../web/unread.js';
function storage(){let value=null;return {getItem:()=>value,setItem:(key,next)=>{value=next;},get value(){return value;}};}
const status={node:'radio-a',incident:'incident-1',peers:[]};
const messages=[{id:'text-1',origin:'radio-b'},{id:'text-2',origin:'radio-b'},{id:'own',origin:'radio-a'}];
test('chat badges count incoming texts once and opening Chat persists their read state',()=>{
  const saved=storage(),tracker=new UnreadTracker(saved);
  assert.equal(tracker.chat(status,messages),2);
  assert.equal(tracker.chat(status,[...messages,messages[0]]),2);
  assert.equal(tracker.chat(status,messages,true),0);
  assert.equal(new UnreadTracker(saved).chat(status,messages),0);
  assert.equal(tracker.chat(status,[...messages,{id:'text-3',origin:'radio-b'}]),1);
  // Delivery/reaction updates to the same text do not create another unread item.
  assert.equal(tracker.chat(status,messages.map(m=>({...m,receipts:[{id:'radio-c'}],reactions:[{emoji:'👍'}]}))),0);
});
test('chat read markers remain separate for each radio and incident, and survive a reboot',()=>{
  const tracker=new UnreadTracker(storage());tracker.chat(status,messages,true);
  assert.equal(tracker.chat({...status,bootSession:2},messages),0);
  assert.equal(tracker.chat({...status,node:'radio-c'},messages),3);
  assert.equal(tracker.chat({...status,incident:'incident-2'},messages),2);
  assert.equal(tracker.chat({...status,incident:'0000000000000000'},messages),0);
});
test('incident badges count unseen online incidents once, excluding the joined incident',()=>{
  const saved=storage(),tracker=new UnreadTracker(saved);
  const next={...status,peers:[{incident:'incident-1',online:true},{incident:'incident-2',online:true},{incident:'incident-2',online:true},{incident:'incident-3',online:false},{incident:'0000000000000000',online:true}]};
  assert.equal(tracker.incidents(next),1);assert.equal(tracker.incidents(next,true),0);
  assert.equal(new UnreadTracker(saved).incidents(next),0);
  assert.equal(tracker.incidents({...next,peers:[...next.peers,{incident:'incident-3',online:true}]}),1);
  assert.equal(tracker.incidents({...next,incident:'incident-3',peers:[{incident:'incident-3',online:true}]}),0);
});
test('blocked or malformed local storage preserves session read behavior and has bounded history',()=>{
  const tracker=new UnreadTracker({getItem(){throw Error();},setItem(){throw Error();}});
  assert.equal(tracker.chat(status,messages,true),0);assert.equal(tracker.chat(status,messages),0);
  const saved=storage();saved.setItem('',JSON.stringify({version:1,contexts:[null,['bad',null],[{},[]],['chat:radio-a:incident-1',['text-1']]]}));
  assert.equal(new UnreadTracker(saved).chat(status,messages),1);
  const bounded=new UnreadTracker(saved);
  for(let i=0;i<100;i++)bounded.chat({...status,incident:`incident-${i}`},Array.from({length:150},(_,j)=>({id:`text-${j}`,origin:'radio-b'})),true);
  const data=JSON.parse(saved.value);assert.ok(data.contexts.length<=64);assert.ok(data.contexts.every(entry=>entry[1].length<=96));
});
test('navigation badges hide zero, cap visual counts and expose the full accessible count',()=>{
  const previous=globalThis.document;
  const elements=new Map([['chat-badge',{}],['chat-unread',{}]]);
  globalThis.document={getElementById:id=>elements.get(id)};
  try{
    setNavBadge('chat',123,'unread texts');assert.equal(elements.get('chat-badge').textContent,'99+');assert.equal(elements.get('chat-badge').hidden,false);assert.equal(elements.get('chat-unread').textContent,'123 unread texts');
    setNavBadge('chat',0,'unread texts');assert.equal(elements.get('chat-badge').hidden,true);assert.equal(elements.get('chat-unread').textContent,'No unread texts');
  }finally{globalThis.document=previous;}
});
