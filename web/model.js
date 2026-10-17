export const priorities = ['Routine', 'Health & Welfare', 'Priority', 'Emergency'];
export const utf8 = value => new TextEncoder().encode(value);
export const chatEmojis = ['👍','👎','❤️','✅','❓','🚨','👀'];
export function validateChatText(value) {
  if(typeof value!=='string' || !value.trim())throw new Error('Enter a chat message.');
  if(utf8(value).length>200)throw new Error('Chat messages are limited to 200 UTF-8 bytes. Emojis can use several bytes.');
  if(/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))throw new Error('Chat contains an unsupported control character.');
  for(let i=0;i<value.length;++i){const c=value.charCodeAt(i);
    if(c>=0xd800 && c<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00 && next<=0xdfff))throw new Error('Chat contains an invalid emoji or character.');}
    else if(c>=0xdc00 && c<=0xdfff)throw new Error('Chat contains an invalid emoji or character.');
  }
  return value;
}
export function chatRadioStatus(message, peers, self) {
  const stations=(message.receipts||[]).filter(receipt=>receipt.id!==self)
    .map(receipt=>peers.find(peer=>peer.id===receipt.id)?.callsign || receipt.callsign || receipt.id);
  if(stations.length)return `Radio ACK: ${stations.join(', ')}`;
  if(message.origin!==self)return 'Received by this radio';
  return message.retrying?'Awaiting radio ACK':'No radio ACK · retries ended or interrupted';
}
export function chatReactionGroups(message,self) {
  return chatEmojis.map(emoji=>{
    const people=(message.reactions||[]).filter(reaction=>reaction.emoji===emoji);
    const mine=people.find(reaction=>reaction.origin===self);
    return {emoji,count:people.length,mine:!!mine,people:people.map(person=>person.callsign||person.origin),
      status:mine?(mine.acked?'Your reaction: radio ACK':mine.retrying?'Your reaction: awaiting radio ACK':'Your reaction: no radio ACK'):''};
  }).filter(group=>group.count);
}
function chatTimelineRows(events) {
  const reactions=new Map();
  for(const event of events)if(event.body.type==='chat-reaction'){
    const key=`${event.meta.origin}:${event.body.target}:${event.body.emoji}`,previous=reactions.get(key);
    if(!previous || ((event.body.sequence-previous.body.sequence)|0)>0)reactions.set(key,event);
  }
  return events.filter(event=>event.body.type==='chat-message').sort((a,b)=>a.meta.order-b.meta.order).map(event=>({
    ...event.body,...event.meta,reactions:[...reactions.values()].filter(reaction=>reaction.body.target===event.meta.id && reaction.body.active)
      .map(reaction=>({origin:reaction.meta.origin,callsign:reaction.body.sender,emoji:reaction.body.emoji,acked:!!reaction.meta.receipts?.length,retrying:!!reaction.meta.retrying}))
  }));
}
export function chatTimeline(events) {return chatTimelineRows(events).slice(-30);}
export function chatTimelinePage(events,beforeId='') {
  const timeline=chatTimelineRows(events);
  let end=timeline.length;
  if(beforeId){end=timeline.findIndex(message=>message.id===beforeId);if(end<0)throw new Error('Chat cursor not found in this incident history');}
  const start=Math.max(0,end-30);
  return {messages:timeline.slice(start,end),hasOlder:start>0,allMessages:timeline.map(({id,origin})=>({id,origin}))};
}
export function numberUntitledDrafts(drafts,counter=0) {
  const untitled=drafts.filter(draft=>!draft.form.subject?.trim());
  let next=untitled.length && Number.isSafeInteger(counter) && counter>0?counter:0;
  for(const draft of untitled)if(Number.isSafeInteger(draft.untitledNumber) && draft.untitledNumber>0)next=Math.max(next,draft.untitledNumber);
  const numbers=new Map(),used=new Set();
  for(const draft of [...untitled].sort((a,b)=>a.savedAt-b.savedAt || a.id.localeCompare(b.id))){
    let number=draft.untitledNumber;
    if(!Number.isSafeInteger(number) || number<1 || used.has(number))number=++next;
    used.add(number);numbers.set(draft.id,number);
  }
  return {counter:next,drafts:drafts.map(draft=>{
    const result={...draft};delete result.untitledNumber;
    if(numbers.has(draft.id))result.untitledNumber=numbers.get(draft.id);
    return result;
  })};
}
export function draftLabel(draft) {
  return draft.form.subject?.trim()?draft.form.subject:`Untitled draft-${draft.untitledNumber}`;
}
export function crc32(value) {
  let c = 0xffffffff;
  for (const byte of typeof value === 'string' ? utf8(value) : value) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}
export function validateForm(form) {
  if (!form.message?.trim()) throw new Error('Enter a message.');
  if (utf8(form.message).length > 2800) throw new Error('Message exceeds 2800 UTF-8 bytes.');
  if (form.recipient !== '*' && !/^[A-Z0-9/-]{3,16}$/.test(form.recipient)) throw new Error('Enter a recipient callsign or choose broadcast.');
  if (!Number.isInteger(form.priority) || form.priority < 0 || form.priority > 3) throw new Error('Choose a valid precedence.');
  for (const key of ['subject','to','from','approvedBy','approvedPosition','signature','replyBy','replyPosition'])
    if (utf8(form[key] || '').length > 160) throw new Error(`${key} exceeds 160 UTF-8 bytes.`);
  if (form.location && (!Number.isFinite(form.location.lat) || !Number.isFinite(form.location.lon) || Math.abs(form.location.lat)>90 || Math.abs(form.location.lon)>180)) throw new Error('Invalid coordinates.');
  return form;
}
export function receiptRows(meta, peers, self) {
  const rows = new Map((meta.expected || []).filter(p=>p.id!==self).map(p => [p.id, {...p}]));
  for (const receipt of meta.receipts || []) {
    if (receipt.id !== self && !rows.has(receipt.id)) rows.set(receipt.id, {id: receipt.id});
  }
  return [...rows.values()].map(row => {
    const peer = peers.find(p => p.id === row.id);
    const receipt = (meta.receipts || []).find(r => r.id === row.id);
    return {...row, callsign: peer?.callsign || row.callsign || receipt?.callsign || row.id, received: !!receipt, human: !!receipt?.human,
      online: !!peer?.online, status: receipt?.human ? 'Human acknowledged' : receipt ? 'Radio received' : peer?.online ? 'Pending' : 'Pending · offline'};
  });
}
export function deliveryStatus(meta, peers, self) {
  const rows=receiptRows(meta,peers,self);
  const radio=rows.filter(r=>r.received).map(r=>r.callsign);
  const human=rows.filter(r=>r.human).map(r=>r.callsign);
  const directed=meta.recipient && meta.recipient!=='*';
  const targets=directed?rows.filter(r=>r.callsign===meta.recipient):rows;
  const complete=directed?targets.some(r=>r.received):rows.length>0 && rows.every(r=>r.received);
  const pending=targets.filter(r=>!r.received).map(r=>r.callsign);
  if(directed && !targets.length)pending.push(meta.recipient);
  const label=radio.length?`Radio ACK by ${radio.join(', ')}`:'Awaiting radio ACK';
  return {radio,human,pending,complete,label};
}
export function manualAcknowledgments(meta, peers, self, callsign) {
  const stations=new Map();
  for(const receipt of meta.receipts||[])if(receipt.human){
    const name=receipt.callsign || peers.find(peer=>peer.id===receipt.id)?.callsign ||
      (meta.expected||[]).find(station=>station.id===receipt.id)?.callsign ||
      (receipt.id===self?callsign:'') || receipt.id;
    stations.set(receipt.id,name);
  }
  return [...stations.values()];
}
export function verifyArchive(record) {
  if (typeof record.body !== 'string' || crc32(record.body) !== record.meta?.hash) throw new Error('Archive verification failed; radio copy retained.');
  return record;
}


export function formDeliverySummary(meta, station) {
  const radio=deliveryStatus(meta,station.peers||[],station.node).radio;
  const human=manualAcknowledgments(meta,station.peers||[],station.node,station.callsign);
  const parts=[];
  if(radio.length)parts.push(`Radio Ack: ${radio.join(', ')}`);
  if(human.length)parts.push(`Human Ack: ${human.join(', ')}`);
  return parts.join(' · ') || (station.paused?'Transmission paused':!station.txEnabled?'Transmission disabled':'Awaiting radio ACK');
}
