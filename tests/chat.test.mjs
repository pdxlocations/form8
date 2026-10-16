import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateChatText,utf8,chatTimeline,chatRadioStatus,chatReactionGroups} from '../web/model.js';

test('chat uses a 200-byte UTF-8 limit, including multi-codepoint emoji',()=>{
  assert.equal(validateChatText('a'.repeat(200)).length,200);
  assert.equal(utf8(validateChatText('👍'.repeat(50))).length,200);
  assert.equal(validateChatText('Hello 👩🏽‍🚒\nReady ✅'),'Hello 👩🏽‍🚒\nReady ✅');
  for(const invalid of ['a'.repeat(201),'👍'.repeat(51),'  \n\t','a\0b','\ud800','\udc00'])assert.throws(()=>validateChatText(invalid));
});
const event=(id,body,order=1,origin='self')=>({meta:{id,origin,order,receipts:[],retrying:true},body:{type:'chat-message',sender:'TEST1',text:'Hello',...body}});
test('late and reordered reaction retries cannot resurrect a removed reaction',()=>{
  const message=event('message',{});
  const add=event('add',{type:'chat-reaction',target:'message',emoji:'👍',sequence:10,active:true},2);
  const remove=event('remove',{...add.body,sequence:11,active:false},3);
  assert.deepEqual(chatTimeline([message,remove,add])[0].reactions,[]);
  const other=event('other',{...add.body,sender:'TEST2',sequence:1},4,'peer');
  const timeline=chatTimeline([message,remove,add,other]);
  assert.equal(timeline[0].reactions.length,1);assert.equal(timeline[0].reactions[0].origin,'peer');
});
test('chat replies retain their parent; only the newest 30 text messages are returned',()=>{
  const messages=Array.from({length:40},(_,i)=>event(String(i),{parent:i?'0':undefined},i));
  const result=chatTimeline(messages.reverse());assert.equal(result.length,30);
  assert.equal(result[0].id,'10');assert.equal(result[29].parent,'0');
});
test('radio ACK labels resolve peers and never treat a local save as a remote ACK',()=>{
  assert.equal(chatRadioStatus({origin:'self',retrying:true,receipts:[{id:'self'}]},[],'self'),'Awaiting radio ACK');
  assert.match(chatRadioStatus({origin:'self',retrying:false,receipts:[]},[],'self'),/No radio ACK/);
  assert.equal(chatRadioStatus({origin:'peer',receipts:[]},[],'self'),'Received by this radio');
  assert.equal(chatRadioStatus({origin:'self',receipts:[{id:'peer'}]},[{id:'peer',callsign:'NET-B'}],'self'),'Radio ACK: NET-B');
});
test('reactions group by emoji and expose own delivery without form acknowledgments',()=>{
  const groups=chatReactionGroups({reactions:[{emoji:'👍',origin:'self',callsign:'NET-A',acked:true},{emoji:'👍',origin:'peer',callsign:'NET-B'}]},'self');
  assert.equal(groups[0].count,2);assert.equal(groups[0].mine,true);assert.match(groups[0].status,/radio ACK/);
  assert.deepEqual(groups[0].people,['NET-A','NET-B']);
});
