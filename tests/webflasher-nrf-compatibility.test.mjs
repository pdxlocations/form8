import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nrfCompatibility,validateNrfTargets,verifyNrfImage} from '../webflasher/model.js';
import {uf2At,hexAt,imageFor} from './helpers/nrf-images.mjs';
const catalog=JSON.parse(readFileSync(new URL('../config/nrf52-targets.json',import.meta.url)));
test('every nRF profile requires an explicit matching installed SoftDevice',()=>{
 for(const target of catalog){
  assert.equal(nrfCompatibility(target,target.softdevice).ok,true,target.environment);
  for(const installed of ['',undefined,'unknown','0.4.2','6.0.0',target.softdevice==='6.1.1'?'7.3.0':'6.1.1'])assert.equal(nrfCompatibility(target,installed).ok,false,target.environment);
  assert.equal(nrfCompatibility({...target,softdevice:undefined},target.softdevice).ok,false);
 }
});
test('catalog entries without consistent SoftDevice metadata cannot be offered',()=>{
 const bytes=uf2At(0x27000),file='form8-rak4631.uf2',image=imageFor(file,bytes),release={assets:[{name:file,bytes:bytes.length}]},sums=`${image.sha256}  ${file}`;
 for(const extra of [{},{softdevice:'7.3.0'},{softdevice:'6.1.1',applicationStart:'0x27000'},{softdevice:'garbage',applicationStart:'0x27000'}])assert.deepEqual(validateNrfTargets([{environment:'rak4631',board:'RAK4631',...extra}],sums,release),[]);
});
test('UF2 and HEX downloads must match both declared layout and installed SoftDevice',async()=>{
 for(const target of catalog)for(const format of ['uf2','hex']){
  const start=Number(target.applicationStart),make=format==='uf2'?uf2At:hexAt,file=`form8-${target.environment}.${format}`;
  const bytes=make(start);await verifyNrfImage(bytes.buffer,imageFor(file,bytes),target,target.softdevice);
  const wrong=make(start===0x26000?0x27000:0x26000);
  await assert.rejects(verifyNrfImage(wrong.buffer,imageFor(file,wrong),target,target.softdevice),/reserved|start/);
  await assert.rejects(verifyNrfImage(bytes.buffer,imageFor(file,bytes),target,''),/installed SoftDevice/);
 }
});
test('UF2 cannot target another processor or overwrite reserved memory even with a valid hash',async()=>{
 const target=catalog.find(t=>t.environment==='rak4631');
 for(const mutate of [v=>v.setUint32(28,0,true),v=>v.setUint32(12,0xf4000,true),v=>v.setUint32(36,0x1001,true)]){
  const bytes=uf2At(0x27000);mutate(new DataView(bytes.buffer));const image=imageFor('form8-rak4631.uf2',bytes);
  await assert.rejects(verifyNrfImage(bytes.buffer,image,target,'7.3.0'),/Invalid|reserved/);
 }
});
