export function availableReleases(releases, includePrereleases = false) {
  return releases.filter(release => !release.prerelease || includePrereleases)
    .filter(release => release.assets.some(asset => asset.name === 'manifest.json'))
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
