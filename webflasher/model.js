export function availableReleases(releases, includePrereleases = false) {
  return releases.filter(release => !release.prerelease || includePrereleases)
    .filter(release => release.assets.some(asset => asset.name === 'form8-release.zip'))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export function validateTargets(manifest, release) {
  if (!Array.isArray(manifest)) throw new Error('This release has an invalid board manifest.');
  const names = new Set(release.assets.map(asset => asset.name));
  const seen = new Set();
  const imageOK = (image, offset, expected) => image && image.file === expected && names.has(image.file)
    && typeof image.flashOffset === 'string' && /^0x[0-9a-f]+$/i.test(image.flashOffset)
    && Number(image.flashOffset) === offset && /^[a-f0-9]{64}$/.test(image.sha256)
    && Number.isSafeInteger(image.bytes) && image.bytes > 0 && image.bytes <= 20 * 1024 * 1024;
  const targets = manifest.filter(target => {
    if (!target || !/^[a-z0-9-]+$/.test(target.environment) || seen.has(target.environment) || typeof target.board !== 'string'
      || (target.chipFamily !== undefined && !['ESP32','ESP32-S3'].includes(target.chipFamily))
      || ![4, 8, 16].includes(target.flashMiB) || target.kind !== 'app-only'
      || !imageOK(target, 65536, `form8-${target.environment}.bin`)
      || target.bytes + 65536 > target.flashMiB * 1024 * 1024) return false;
    seen.add(target.environment);
    return true;
  }).map(target => ({...target, factory: imageOK(target.factory, 0, `form8-${target.environment}-factory.bin`)
    && target.factory.erasesData === true && target.factory.bytes <= target.flashMiB * 1024 * 1024 ? target.factory : null}));
  if (!targets.length) throw new Error('No complete, compatible firmware builds are available in this release yet.');
  return targets;
}

export async function verifyImage(buffer, image, cryptoProvider = globalThis.crypto) {
  if (buffer.byteLength !== image.bytes) throw new Error('Download size does not match the release manifest. Please try again.');
  const hash = Array.from(new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== image.sha256) throw new Error('Firmware checksum failed. Nothing has been flashed. Refresh and try again.');
}

export function installManifest(target, image, version, binaryURL) {
  const chipFamily=target.chipFamily===undefined?'ESP32-S3':target.chipFamily;
  if(!['ESP32','ESP32-S3'].includes(chipFamily))throw new Error('Unsupported processor family.');
  return {name: `Form8 · ${target.board}`, version, new_install_prompt_erase: true,
    new_install_improv_wait_time: 0,
    builds: [{chipFamily, parts: [{path: binaryURL, offset: Number(image.flashOffset)}]}]};
}

// Sizes come from the foldered ZIP catalog; hashes come from its nRF checksum file.
export function validateNrfTargets(catalog, checksums, release) {
  if (!Array.isArray(catalog) || typeof checksums !== 'string') throw new Error('Invalid nRF board data.');
  const hashes = new Map();
  for (const line of checksums.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([a-f0-9]{64})  (form8-[a-z0-9-]+\.(?:uf2|hex))$/.exec(line);
    if (!match || hashes.has(match[2])) throw new Error('Invalid nRF release checksums.');
    hashes.set(match[2], match[1]);
  }
  const image = (environment, format) => {
    const file = `form8-${environment}.${format}`;
    const asset = release.assets.find(a => a.name === file);
    return asset && hashes.has(file) && Number.isSafeInteger(asset.bytes) && asset.bytes > 0 && asset.bytes <= 8*1024*1024
      ? {file, bytes:asset.bytes, sha256:hashes.get(file)} : null;
  };
  return catalog.filter(t => t && /^[a-z0-9-]+$/.test(t.environment) && typeof t.board === 'string'
    && nrfApplicationStart(t) !== null)
    .map(t => ({...t, chipFamily:'NRF52840', experimental:true, uf2:image(t.environment,'uf2'), hex:image(t.environment,'hex')}))
    .filter(t => t.uf2);
}

// Fail closed: every downloadable nRF profile names its required SoftDevice/layout.
export function nrfApplicationStart(target) {
  const start={'6.1.1':0x26000,'7.3.0':0x27000}[target?.softdevice];
  return start && target.applicationStart===`0x${start.toString(16)}` ? start : null;
}
export function nrfCompatibility(target, installed) {
  if(nrfApplicationStart(target)===null)return {ok:false,message:'This build has no verified SoftDevice requirement. Choose another build.'};
  if(!installed)return {ok:false,message:'Read the installed SoftDevice version from INFO_UF2.TXT or the board’s programming tools, then select it below. The bootloader version is a different number.'};
  if(!['6.1.1','7.3.0'].includes(installed))return {ok:false,message:'No compatible build can be confirmed. Identify the installed SoftDevice before downloading.'};
  if(installed!==target.softdevice)return {ok:false,message:`Version mismatch: your board has S140 ${installed}; this image requires S140 ${target.softdevice}. Choose a matching board profile or release. Do not install this image.`};
  return {ok:true,message:`Match confirmed: installed S140 ${installed} matches this build. The website relies on the version you checked; it cannot read your radio automatically.`};
}
export async function verifyNrfImage(buffer,image,target,installed,cryptoProvider=globalThis.crypto) {
  const compatibility=nrfCompatibility(target,installed);
  if(!compatibility.ok)throw new Error(compatibility.message);
  await verifyImage(buffer,image,cryptoProvider);
  const start=nrfApplicationStart(target),end=0xed000,memory=new Map(),occupied=new Uint8Array(end-start);
  function add(address,data){
    if(address<start || address+data.length>end)throw new Error('Firmware overlaps reserved SoftDevice, filesystem, or bootloader memory.');
    for(let i=0;i<data.length;i++){
      if(occupied[address+i-start])throw new Error('Firmware contains overlapping application data.');
      occupied[address+i-start]=1;
      if(address+i<start+8)memory.set(address+i,data[i]);
    }
  }
  if(image.file.endsWith('.uf2')){
    if(!buffer.byteLength || buffer.byteLength%512)throw new Error('Invalid UF2 block size.');
    for(let offset=0;offset<buffer.byteLength;offset+=512){
      const view=new DataView(buffer,offset,512),size=view.getUint32(16,true);
      if(view.getUint32(0,true)!==0x0a324655 || view.getUint32(4,true)!==0x9e5d5157 || view.getUint32(508,true)!==0x0ab16f30
        || view.getUint32(8,true)!==0x2000 || view.getUint32(28,true)!==0xada52840 || size!==256
        || view.getUint32(20,true)!==offset/512 || view.getUint32(24,true)!==buffer.byteLength/512)throw new Error('Invalid nRF52840 application UF2.');
      add(view.getUint32(12,true),new Uint8Array(buffer,offset+32,size));
    }
  }else if(image.file.endsWith('.hex')){
    let base=0,eof=false;
    for(const line of new TextDecoder('utf-8',{fatal:true}).decode(buffer).split(/\r?\n/)){
      if(!line.trim())continue;
      if(eof || !/^:(?:[a-f0-9]{2})+$/i.test(line))throw new Error('Invalid Intel HEX record.');
      const bytes=Uint8Array.from(line.slice(1).match(/../g),part=>parseInt(part,16));
      const count=bytes[0],address=(bytes[1]<<8)|bytes[2],kind=bytes[3];
      if(bytes.length!==count+5 || bytes.reduce((sum,b)=>sum+b,0)%256)throw new Error('Invalid Intel HEX checksum or length.');
      if(kind===0)add(base+address,bytes.slice(4,4+count));
      else if(kind===1&&count===0)eof=true;
      else if((kind===2||kind===4)&&count===2)base=((bytes[4]<<8)|bytes[5])*(kind===2?16:65536);
      else if(!([3,5].includes(kind)&&count===4))throw new Error('Unsupported Intel HEX record.');
    }
    if(!eof)throw new Error('Incomplete Intel HEX file.');
  }else throw new Error('Unsupported nRF file format.');
  if(Array.from({length:8},(_,i)=>start+i).some(address=>!memory.has(address)))throw new Error('Application start does not match the selected SoftDevice version.');
  const vectors=new DataView(Uint8Array.from({length:8},(_,i)=>memory.get(start+i)).buffer),sp=vectors.getUint32(0,true),pc=vectors.getUint32(4,true);
  if(sp<=0x20008000 || sp>0x20040000 || !(pc&1) || pc-1<start || pc-1>=end)throw new Error('Invalid application vector table.');
}
