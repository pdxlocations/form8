import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import * as model from '../webflasher/model.js';
import {uf2At,hexAt,imageFor} from './helpers/nrf-images.mjs';

test('nRF download works without Web Serial, rejects corruption and clears stale downloads',async()=>{
  const source=await readFile(new URL('../webflasher/app.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../webflasher/index.html',import.meta.url),'utf8');
  const elements=new Map();
  for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set(id,{id,value:'',hidden:false,checked:false,disabled:false,listeners:{},classList:{toggle(){}},
    addEventListener(event,fn){this.listeners[event]=fn;},removeAttribute(name){delete this[name];},
    replaceChildren(){this.items=[];this.value='';},add(option){this.items.push(option);if(this.items.length===1)this.value=String(option.value);}});
  const el=id=>elements.get(id);
  el('nrf-format').value='uf2';
  el('install-area').hidden=el('download-area').hidden=true;
  const mode={name:'mode',value:'factory',addEventListener(){}}; // stale ESP32 factory choice must not block nRF

  const files=['form8-rak4631-s140-6-1-1.uf2','form8-rak4631-s140-6-1-1.hex'];
  const dataByFile=new Map([[files[0],uf2At(0x26000)],[files[1],hexAt(0x26000)]]);
  let binaryRequests=0;
  const release={id:1,tag:'v1',publishedAt:'2026-01-01',assets:[{name:'form8-release.zip'}]};
  const bundledAssets=[{name:'SHA256SUMS-NRF52'},...files.map(name=>({name,bytes:dataByFile.get(name).length}))];
  let corrupt=false;
  const revoked=[];
  class BlobURL extends URL {static createObjectURL(){return 'blob:verified';}static revokeObjectURL(url){revoked.push(url);}}
  const context=createContext({...model,crypto:webcrypto,URL:BlobURL,URLSearchParams,Blob,navigator:{},
    window:{isSecureContext:true,addEventListener(){}},
    document:{getElementById:el,querySelector:()=>mode,querySelectorAll:selector=>selector.startsWith('#board')?[el('board'),el('nrf-format'),el('nrf-softdevice'),el('confirm-board'),el('confirm-erase'),mode]:[mode,el('confirm-board'),el('confirm-erase')]},
    Option:class {constructor(text,value){this.text=text;this.value=value;}},
    fetch:async url=>{
      if(url==='nrf52-targets.json')return {ok:true,json:async()=>[{environment:'rak4631-s140-6-1-1',board:'RAK4631 / stock S140 6.1.1',radio:'SX1262',softdevice:'6.1.1',applicationStart:'0x26000'}]};
      const kind=new URL(url,'https://example.com').searchParams.get('resource');
      if(kind==='releases')return {ok:true,json:async()=>({releases:[release]})};
      if(kind==='catalog')return {ok:true,json:async()=>({assets:bundledAssets})};
      if(kind==='checksums')return {ok:true,text:async()=>files.map(f=>`${imageFor(f,dataByFile.get(f)).sha256}  ${f}`).join('\n')};
      if(kind==='binary'){binaryRequests++;const data=dataByFile.get(new URL(url,'https://example.com').searchParams.get('file'));return {ok:true,arrayBuffer:async()=>corrupt?new Uint8Array(data.length).buffer:data.buffer};}
      throw new Error(`Unexpected request ${url}`);
    }});
  // Await startup so assertions observe a completed release/board load.
  await runInContext(source.replace(/^import .*;\n/,'').replace(/refresh\(\);\s*$/,'globalThis.started=refresh();'),context);
  await context.started;
  assert.equal(el('board').value,'rak4631-s140-6-1-1');
  assert.match(el('board-info').textContent,/S140 6\.1\.1/);
  assert.equal(el('esp-mode').hidden,true);
  assert.equal(el('nrf-help').hidden,false);
  el('confirm-board').checked=true;
  el('confirm-board').listeners.change();
  assert.equal(el('prepare').disabled,true);
  await el('prepare').listeners.click();assert.equal(binaryRequests,0);
  el('nrf-softdevice').value='7.3.0';el('nrf-softdevice').listeners.change();
  el('confirm-board').checked=true;el('confirm-board').listeners.change();
  assert.equal(el('prepare').disabled,true);assert.match(el('nrf-compatibility').textContent,/Version mismatch/);
  await el('prepare').listeners.click();assert.equal(binaryRequests,0);
  el('nrf-softdevice').value='unknown';el('nrf-softdevice').listeners.change();
  assert.equal(el('prepare').disabled,true);
  el('nrf-softdevice').value='6.1.1';el('nrf-softdevice').listeners.change();
  assert.equal(el('confirm-board').checked,false);
  el('confirm-board').checked=true;el('confirm-board').listeners.change();
  assert.equal(el('prepare').disabled,false);
  await el('prepare').listeners.click();
  assert.equal(el('download-area').hidden,false);
  assert.equal(el('install-area').hidden,true);
  assert.equal(el('save-firmware').download,files[0]);
  el('nrf-format').value='hex';el('nrf-format').listeners.change();
  assert.equal(el('download-area').hidden,true);
  assert.equal(el('save-firmware').href,undefined);
  assert.deepEqual(revoked,['blob:verified']);
  corrupt=true;
  await el('prepare').listeners.click();
  assert.equal(el('download-area').hidden,true);
  assert.match(el('status').textContent,/checksum failed/);
  corrupt=false;
  await el('prepare').listeners.click();
  assert.equal(el('save-firmware').download,files[1]);
  el('nrf-softdevice').value='7.3.0';el('nrf-softdevice').listeners.change();
  assert.equal(el('save-firmware').href,undefined);assert.equal(el('prepare').disabled,true);
  el('board').listeners.change();assert.equal(el('nrf-softdevice').value,'');
});
