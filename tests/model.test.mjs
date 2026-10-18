import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32, token, validateForm, receiptRows, verifyArchive, deliveryStatus, manualAcknowledgments, formDeliverySummary, canHumanAcknowledge} from '../web/model.js';
test('CRC matches the radio wire protocol, including UTF-8',()=>{
  assert.equal(crc32('123456789'),0xcbf43926);assert.equal(crc32('incident'),crc32(new TextEncoder().encode('incident')));
});
test('submission IDs are stable-capable random 128-bit IDs',()=>{const ids=Array.from({length:100},token);assert.equal(new Set(ids).size,100);assert.ok(ids.every(id=>/^[a-f0-9]{32}$/.test(id)));});
test('two paragraphs fit, while UTF-8 byte limits and invalid location are rejected',()=>{
  const form={recipient:'*',priority:3,message:'A'.repeat(1200)+'\n\n'+'B'.repeat(1200)};assert.equal(validateForm(form),form);
  assert.throws(()=>validateForm({...form,message:'é'.repeat(1401)}),/2800/);assert.throws(()=>validateForm({...form,location:{lat:91,lon:0}}),/coordinates/);
});
test('archive is verified before offload; changed body or checksum cannot pass',()=>{
  const record={body:'{"message":"hello"}',meta:{hash:crc32('{"message":"hello"}')}};assert.equal(verifyArchive(record),record);
  assert.throws(()=>verifyArchive({...record,body:'changed'}),/verification/);
});
test('offline stations remain pending; radio and human receipts stay distinct',()=>{
  const meta={expected:[{id:'a',callsign:'K1AAA'},{id:'b',callsign:'K1BBB'},{id:'c',callsign:'K1CCC'}],receipts:[{id:'a',human:false},{id:'b',human:true}]};
  const rows=receiptRows(meta,[], 'self');assert.equal(rows[0].status,'Radio received');assert.equal(rows[1].status,'Human acknowledged');assert.equal(rows[2].status,'Pending · offline');
});
test('delivery indicator excludes self and never calls an undiscovered broadcast ACKed',()=>{
  const m={recipient:'*',receipts:[{id:'self',human:false}]};
  assert.deepEqual(deliveryStatus(m,[],'self'),{radio:[],human:[],pending:[],complete:false,label:'Awaiting radio ACK'});
});
test('ACK indicator identifies durable remote receipts and distinguishes human ACKs',()=>{
  const m={recipient:'*',expected:[{id:'a',callsign:'K1AAA'},{id:'b',callsign:'K1BBB'}],receipts:[{id:'self'},{id:'a',human:true}]};
  let result=deliveryStatus(m,[],'self');
  assert.equal(result.label,'Radio ACK by K1AAA');assert.deepEqual(result.human,['K1AAA']);assert.deepEqual(result.pending,['K1BBB']);assert.equal(result.complete,true);
  m.receipts.push({id:'b'});assert.equal(deliveryStatus(m,[],'self').complete,true);
});
test('directed messages need the addressed callsign ACK; relay receipts are visible separately',()=>{
  const m={recipient:'K1BBB',receipts:[{id:'self'},{id:'a',callsign:'K1AAA'}]};
  assert.equal(deliveryStatus(m,[],'self').complete,false);
  assert.deepEqual(deliveryStatus(m,[],'self').pending,['K1BBB']);
  m.receipts.push({id:'b',callsign:'K1BBB'});
  assert.equal(deliveryStatus(m,[],'self').complete,true);
  assert.equal(deliveryStatus(m,[],'self').label,'Radio ACK by K1AAA, K1BBB');
});

test('manual acknowledgment list includes every station, including self and offline stations, without counting radio-only receipts',()=>{
  const meta={expected:[{id:'offline',callsign:'NET-OFFLINE'}],receipts:[
    {id:'self',human:true},{id:'remote',human:true},{id:'offline',human:true},
    {id:'saved',callsign:'NET-SAVED',human:true},{id:'unknown',human:true},{id:'radio',human:false}
  ]};
  assert.deepEqual(manualAcknowledgments(meta,[{id:'remote',callsign:'NET-B',online:true}], 'self','NET-A'),
    ['NET-A','NET-B','NET-OFFLINE','NET-SAVED','unknown']);
  meta.receipts[0].callsign='NET-ORIGINAL';
  assert.equal(manualAcknowledgments(meta,[],'self','NET-RENAMED')[0],'NET-ORIGINAL');
  assert.deepEqual(manualAcknowledgments({receipts:[{id:'radio',human:false}]},[],'self','NET-A'),[]);
});

test('sent form summary switches from waiting to radio and human ACK callsigns',()=>{
 const station={node:'self',callsign:'NET-A',txEnabled:true,peers:[]};
 const meta={recipient:'*',expected:[{id:'b',callsign:'NET-B'},{id:'c',callsign:'NET-C'}],receipts:[{id:'self'}]};
 assert.equal(formDeliverySummary(meta,station),'Awaiting radio ACK');
 meta.receipts.push({id:'b'});
 assert.equal(formDeliverySummary(meta,station),'Radio Ack: NET-B'); // Remaining stations do not hide the ACK.
 meta.receipts[1].human=true;
 assert.equal(formDeliverySummary(meta,station),'Radio Ack: NET-B · Human Ack: NET-B');
 meta.receipts.push({id:'self',human:true},{id:'c',callsign:'NET-C',human:true});
 assert.equal(formDeliverySummary(meta,station),'Radio Ack: NET-B, NET-C · Human Ack: NET-B, NET-A, NET-C');
 assert.equal(formDeliverySummary({receipts:[]},{...station,paused:true}),'Radio transmission off');
 assert.equal(formDeliverySummary({receipts:[]},{...station,txEnabled:false}),'Radio transmission off');
});

test('the original sender is labeled Origin on both sender and receiving apps, even without a receipt',()=>{
 const meta={origin:'sender',sender:'NET-A',recipient:'*',expected:[{id:'sender',callsign:'NET-A'}],receipts:[{id:'sender',human:false}]};
 for(const self of ['sender','receiver']){
  const origin=receiptRows(meta,[],self).find(row=>row.id==='sender');
  assert.equal(origin.status,'Origin');assert.equal(origin.callsign,'NET-A');assert.equal(origin.received,true);
  assert.deepEqual(deliveryStatus(meta,[],self).radio,[]);
  assert.equal(deliveryStatus(meta,[],self).complete,false);
 }
 meta.receipts=[];
 assert.equal(receiptRows(meta,[],'receiver')[0].status,'Origin');
 meta.receipts=[{id:'sender',human:true},{id:'other',callsign:'NET-B',human:false}];
 assert.equal(receiptRows(meta,[],'receiver')[0].status,'Origin');
 assert.deepEqual(deliveryStatus(meta,[],'receiver').radio,['NET-B']);
});


test('origin cannot human-ACK and historical origin ACKs are hidden from matrix and summary',()=>{
 const meta={origin:'self',sender:'OLD-CALL',receipts:[{id:'self',human:true},{id:'other',human:true}]},station={node:'self',callsign:'NEW-CALL'};
 assert.equal(canHumanAcknowledge(meta,station),false);assert.equal(canHumanAcknowledge({origin:'other'},station),true);assert.equal(canHumanAcknowledge({},station),false);
 assert.equal(receiptRows(meta,[],'self',true).find(r=>r.origin).human,false);assert.deepEqual(manualAcknowledgments(meta,[],'self','NEW-CALL'),['other']);
});
