import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {availableReleases, validateTargets, verifyImage, installManifest} from '../webflasher/model.js';

const buffer = new TextEncoder().encode('firmware image').buffer;
const image = {file:'form8-heltec-v3.bin',kind:'app-only',flashOffset:'0x10000',bytes:buffer.byteLength,sha256:createHash('sha256').update(new Uint8Array(buffer)).digest('hex')};
const target = {...image,environment:'heltec-v3',board:'Heltec V3',flashMiB:8};
const factory = {...image,file:'form8-heltec-v3-factory.bin',kind:'factory',flashOffset:'0x0',erasesData:true};
const release = {id:1,tag:'v1',publishedAt:'2026-01-01T00:00:00Z',assets:[{name:'manifest.json'},{name:image.file},{name:factory.file}]};

test('flasher hides prereleases and unfinished releases and sorts by publication', () => {
  const preview = {...release,id:2,prerelease:true,publishedAt:'2026-02-01T00:00:00Z'};
  assert.deepEqual(availableReleases([preview,release,{...release,id:3,assets:[]}]).map(r=>r.id),[1]);
  assert.deepEqual(availableReleases([release,preview],true).map(r=>r.id),[2,1]);
});
test('older app-only releases remain usable for updates without inventing factory builds', () => {
  const [result] = validateTargets([target],release);
  assert.equal(result.file,image.file);
  assert.equal(result.factory,null);
});
test('flasher rejects missing assets, unexpected names/offsets and oversized images', () => {
  for (const invalid of [{...target,file:'../../firmware.bin'}, {...target,flashOffset:'0x0'}, {...target,sha256:'bad'},
    {...target,bytes:9*1024*1024}, {...target,environment:'unpublished'}, null]) {
    assert.throws(()=>validateTargets([invalid],release));
  }
  assert.throws(()=>validateTargets([target],{...release,assets:[]}));
  assert.equal(validateTargets([target,target],release).length,1);
});
test('factory images require an explicit destructive flag, correct offset and matching asset', () => {
  assert.equal(validateTargets([{...target,factory}],release)[0].factory.file,factory.file);
  for (const invalid of [{...factory,erasesData:false},{...factory,flashOffset:'0x10000'},{...factory,flashOffset:null},
    {...factory,file:'wrong.bin'},{...factory,bytes:16*1024*1024}]) {
    assert.equal(validateTargets([{...target,factory:invalid}],release)[0].factory,null);
  }
});
test('firmware corruption or truncation prevents installation', async () => {
  await verifyImage(buffer,image,webcrypto);
  await assert.rejects(verifyImage(buffer.slice(1),image,webcrypto),/size/);
  const corrupt = buffer.slice(0);new Uint8Array(corrupt)[0]^=1;
  await assert.rejects(verifyImage(corrupt,image,webcrypto),/checksum/);
});
test('install manifests use verified blobs, exact offsets and an erase choice', () => {
  for (const selected of [image,factory]) {
    const manifest = installManifest(target,selected,'v1','blob:verified');
    assert.equal(manifest.new_install_prompt_erase,true);
    assert.equal(manifest.new_install_improv_wait_time,0);
    assert.deepEqual(manifest.builds,[{chipFamily:'ESP32-S3',parts:[{path:'blob:verified',offset:Number(selected.flashOffset)}]}]);
  }
});

test('original ESP32 builds select ESP32 in the installer while old releases retain S3 compatibility',()=>{
  const esp32={...target,chipFamily:'ESP32'};
  assert.equal(validateTargets([esp32],release)[0].chipFamily,'ESP32');
  assert.equal(installManifest(esp32,image,'v1','blob:verified').builds[0].chipFamily,'ESP32');
  assert.equal(installManifest(target,image,'v1','blob:verified').builds[0].chipFamily,'ESP32-S3');
  for(const chipFamily of ['ESP8266','ESP32-C3',null]){
    assert.throws(()=>validateTargets([{...target,chipFamily}],release),/No complete/);
    assert.throws(()=>installManifest({...target,chipFamily},image,'v1','blob:verified'),/Unsupported/);
  }
});

test('nRF-only releases appear when UF2 and checksums are published', () => {
  const nrf={...release,id:4,assets:[{name:'SHA256SUMS-NRF52'},{name:'form8-rak4631.uf2'}]};
  assert.deepEqual(availableReleases([nrf]).map(r=>r.id),[4]);
  assert.deepEqual(availableReleases([{...nrf,assets:nrf.assets.slice(1)}]),[]);
});

test('nRF downloads require a matching published asset, size and unique checksum', async () => {
  const {validateNrfTargets}=await import('../webflasher/model.js');
  const catalog=[{environment:'rak4631',board:'RAK4631',softdevice:'7.3.0',applicationStart:'0x27000'}];
  const file='form8-rak4631.uf2';
  const r={assets:[{name:file,bytes:buffer.byteLength}]};
  const sums=`${image.sha256}  ${file}\n`;
  const [t]=validateNrfTargets(catalog,sums,r);
  await verifyImage(buffer,t.uf2,webcrypto);
  assert.equal(t.hex,null);
  assert.throws(()=>installManifest(t,t.uf2,'v1','blob:verified'),/Unsupported/);
  assert.deepEqual(validateNrfTargets(catalog,sums,{assets:[]}),[]);
  for(const bytes of [0,-1,9*1024*1024,'12'])assert.deepEqual(validateNrfTargets(catalog,sums,{assets:[{name:file,bytes}]}),[]);
  for(const bad of [sums+sums,'bad checksum',`${image.sha256}  ../../firmware.uf2`])assert.throws(()=>validateNrfTargets(catalog,bad,r),/checksums/);
});

test('uploadable nRF catalog matches supported firmware boards', async () => {
  const {readFile}=await import('node:fs/promises');
  assert.equal(await readFile(new URL('../webflasher/nrf52-targets.json',import.meta.url),'utf8'),await readFile(new URL('../config/nrf52-targets.json',import.meta.url),'utf8'));
});
