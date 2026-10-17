import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RadioRpc} from '../companion/radio-rpc.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(rpc,request,data={saved:true},error)=>rpc.receive(Buffer.from(JSON.stringify({request,data,error})+'\n').toString('base64'));

test('RPC waits for the final GATT write callback even if the response notification arrives first',async()=>{
 const sent=[],finish=[];
 const rpc=new RadioRpc({send:({data})=>{sent.push(JSON.parse(data));return new Promise(resolve=>finish.push(resolve));}},'client');
 const first=rpc.request('hello'),second=rpc.request('http',{path:'/api/status',method:'GET'});
 await tick();reply(rpc,1,{node:'esp32'});await tick();assert.equal(sent.length,1);
 finish[0]();assert.equal((await first).node,'esp32');await tick();assert.equal(sent.length,2);
 reply(rpc,2);finish[1]();await second;
});
test('reset cancels queued nRF operations before connecting an ESP32, including when an old send settles late',async()=>{
 const sent=[];let finish;
 const rpc=new RadioRpc({send:({data})=>{const request=JSON.parse(data);sent.push(request);return request.op==='status'?new Promise(resolve=>finish=resolve):Promise.resolve();}},'client');
 const old=rpc.request('status'),queued=rpc.request('known',{records:[]});
 const oldCheck=assert.rejects(old,/Connection changed/),queuedCheck=assert.rejects(queued,/cancelled/);
 await tick();rpc.reset();const hello=rpc.request('hello');await tick();
 assert.deepEqual(sent.map(r=>r.op),['status','hello']);
 reply(rpc,sent[1].request,{protocol:'form8-api-v1',storage:'radio'});await hello;
 finish();await Promise.all([oldCheck,queuedCheck]);await tick();
 assert.deepEqual(sent.map(r=>r.op),['status','hello']);
});
test('RPC errors identify the unsupported operation and API route',async()=>{
 const rpc=new RadioRpc({send:async()=>{}},'client');
 const request=rpc.request('http',{method:'GET',path:'/api/status'});
 const check=assert.rejects(request,/Radio http GET \/api\/status: Unknown operation/);
 await tick();reply(rpc,1,undefined,'Unknown operation');await check;
});

test('RPC reset and deadline reject promptly even when Android never finishes its send',async()=>{
 const rpc=new RadioRpc({send:()=>new Promise(()=>{})},'client',{timeout:20});
 const first=rpc.request('hello');const resetCheck=assert.rejects(first,/Connection changed/);
 await tick();rpc.reset();await resetCheck;
 await assert.rejects(rpc.request('hello'),/Radio hello: Timed out/);
});

test('a rejected write does not leave the response timer or pending request alive',async()=>{
 const rpc=new RadioRpc({send:async()=>{throw Error('Bluetooth write timed out');}},'client');
 await assert.rejects(rpc.request('hello'),/Radio hello: Bluetooth write timed out/);
 assert.equal(rpc.pending.size,0);
});
