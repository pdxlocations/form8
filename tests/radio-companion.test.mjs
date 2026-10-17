import test from 'node:test';
import assert from 'node:assert/strict';
import {RadioCompanionApi} from '../companion/radio-api.js';

test('ESP32 BLE uses radio API storage and the exact same form, chat and ACK routes',async()=>{
 const calls=[],stored=new Map();
 const rpc=async(op,data)=>{calls.push({op,data});assert.equal(op,'http');if(data.path==='/api/status')return {status:200,data:{node:'esp32',board:'Heltec',clientTransport:'bluetooth',wifiEnabled:false}};
  if(data.path==='/api/forms'&&data.method==='POST'){stored.set('form1',data.body);return {status:201,data:{id:'form1',saved:true}};}
  if(data.path==='/api/form?id=form1')return {status:200,data:{meta:{id:'form1'},body:JSON.stringify(stored.get('form1'))}};
  if(data.path==='/api/ack')return {status:200,data:{saved:true}};
  if(data.path==='/api/chat?since=abc')return {status:200,data:{unchanged:true,version:'abc'}};
  throw Error(data.path);
 };
 const api=new RadioCompanionApi(rpc);await api.connect({protocol:'form8-api-v1',storage:'radio'});
 assert.equal(api.status.wifiEnabled,false);await api.request('forms',{message:'Shared body 👋',clientToken:'token'});
 assert.equal(JSON.parse((await api.request('form?id=form1')).body).message,'Shared body 👋');
 await api.request('ack',{id:'form1'});assert.equal(calls.at(-1).data.method,'POST');
 assert.equal((await api.request('chat?since=abc')).unchanged,true);
 assert(!calls.some(call=>['known','commit','publish'].includes(call.op)),'ESP32 must not use companion-owned storage');
});
test('radio errors and disconnects are propagated instead of reporting saved messages',async()=>{
 const api=new RadioCompanionApi(async()=>({status:507,data:{error:'Radio storage full'}}));api.connected=true;
 await assert.rejects(api.request('forms',{message:'test'}),/Radio storage full/);
 api.connected=false;await assert.rejects(api.request('forms',{message:'test'}),/Radio disconnected/);
});
test('ESP32 adapter refuses other protocols and non-API destinations',async()=>{
 const api=new RadioCompanionApi(async()=>({status:200,data:{}}));await assert.rejects(api.connect({storage:'companion'}),/Unsupported/);api.connected=true;
 await assert.rejects(api.request('https://example.com/api/status'),/Invalid/);
 await assert.rejects(api.request('/index.html'),/Invalid/);
});

test('Bluetooth handshake selects ESP32 radio storage and rejects guessing from partial hello data',async()=>{
 const {radioStorage}=await import('../companion/radio-connection.js');
 assert.equal(radioStorage({node:'1'.repeat(16),protocol:'form8-api-v1',storage:'radio'}),'radio');
 assert.equal(radioStorage({node:'1'.repeat(16),peers:[],pending:[],events:[]}),'companion');
 assert.equal(radioStorage({node:'1'.repeat(16),storage:'companion',peers:[]}),'companion');
 for(const invalid of [null,{node:'1'.repeat(16)},{node:'1'.repeat(16),storage:'radio',peers:[]},{node:'1'.repeat(16),peers:null}])assert.throws(()=>radioStorage(invalid),/Update|update|matching/);
});
