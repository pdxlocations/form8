export const priorities = ['Routine', 'Health & Welfare', 'Priority', 'Emergency'];
export const utf8 = value => new TextEncoder().encode(value);
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
export function verifyArchive(record) {
  if (typeof record.body !== 'string' || crc32(record.body) !== record.meta?.hash) throw new Error('Archive verification failed; radio copy retained.');
  return record;
}

