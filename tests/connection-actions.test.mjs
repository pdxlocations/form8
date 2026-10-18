import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {guardAction} from '../web/actions.js';

test('companion scan/connect/disconnect operations share a lock and disable device selection',async()=>{
 const source=readFileSync(new URL('../companion/mobile.js',import.meta.url),'utf8');
 const controls=Object.fromEntries(['scan','connect','disconnect','select','devices'].map(name=>[name,{disabled:false}]));
 let release,calls=0,refreshed=0;const gate=new Promise(resolve=>{release=resolve;});
 const context=vm.createContext({...controls,guardAction,refresh:()=>refreshed++,showConnection(){},operation:async()=>{calls++;await gate;}});
 vm.runInContext(source.slice(source.indexOf(' const task=guardAction('),source.indexOf(' select.onchange=')),context);
 const pending=vm.runInContext('task(operation)',context);assert(Object.values(controls).every(control=>control.disabled));
 await vm.runInContext('task(operation)',context);assert.equal(calls,1);release();await pending;
 assert(Object.values(controls).every(control=>!control.disabled));assert.equal(refreshed,1);
 context.operation=async()=>{calls++;throw Error('Connection failed');};await vm.runInContext('task(operation)',context);
 assert(Object.values(controls).every(control=>!control.disabled));assert.equal(calls,2);assert.equal(refreshed,2);
});
