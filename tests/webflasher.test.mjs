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
