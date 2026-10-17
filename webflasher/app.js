import {availableReleases, validateTargets, validateNrfTargets, verifyImage, installManifest} from './model.js';

const $ = id => document.getElementById(id);
let allReleases = [], releases = [], targets = [], loading = false, preparing = false, revision = 0;
let binaryURL, manifestURL;
const supported = window.isSecureContext && 'serial' in navigator;
const api = (resource, values = {}) => `api.php?${new URLSearchParams({resource, ...values})}`;
const selectedRelease = () => releases.find(release => String(release.id) === $('release').value);
const selectedTarget = () => targets.find(target => target.environment === $('board').value);
const nrf = () => selectedTarget()?.chipFamily === 'NRF52840';
const factory = () => !nrf() && document.querySelector('input[name=mode]:checked').value === 'factory';
const selectedImage = () => nrf() ? selectedTarget()?.[$('nrf-format').value] : factory() ? selectedTarget()?.factory : selectedTarget();
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function clearPrepared() {
  $('install-area').hidden = true;
  $('download-area').hidden = true;
  $('save-firmware').removeAttribute('href');
  $('install').removeAttribute('manifest');
  for (const url of [binaryURL, manifestURL]) if (url) URL.revokeObjectURL(url);
  binaryURL = manifestURL = undefined;
}
function options(select, items, text, value, empty) {
  select.replaceChildren();
  if (!items.length) select.add(new Option(empty, ''));
  for (const item of items) select.add(new Option(text(item), value(item)));
}
function updateControls() {
  const target = selectedTarget();
  $('release').disabled = loading || preparing || !releases.length;
  $('board').disabled = loading || preparing || !targets.length;
  $('refresh').disabled = loading || preparing;
  $('prereleases').disabled = loading || preparing;
  for (const input of document.querySelectorAll('input[name=mode], #confirm-board, #confirm-erase')) input.disabled = loading || preparing;
  $('esp-mode').hidden = nrf();
  $('nrf-help').hidden = !nrf();
  $('nrf-format').disabled = loading || preparing;
  $('prepare').textContent = nrf() ? 'Download & verify firmware file ↓' : 'Download & verify firmware ↓';
  $('nrf-cable-note').hidden = target?.environment !== 'seeed-t1000-e';
  $('erase-confirmation').hidden = !factory();
  $('factory-note').hidden = !factory() || !target || !!target.factory;
  $('prepare').disabled = !(nrf() ? window.isSecureContext && !!globalThis.crypto?.subtle : supported) || loading || preparing || !selectedImage()
    || !$('confirm-board').checked || (factory() && !$('confirm-erase').checked);
  $('prepare').hidden = !$('install-area').hidden || !$('download-area').hidden;
  if (nrf()) $('board-info').textContent = `nRF52840 · ${target.radio} · Experimental. Application only; requires the board’s bootloader and S140 7.3.0. No filesystem upload.`;
  else if (target) $('board-info').textContent = `${target.chipFamily||"ESP32-S3"} · ${target.radio} · ${target.flashMiB} MB flash${target.experimental ? ' · EXPERIMENTAL target' : ''}. Check your physical board: USB cannot distinguish these board variants.`;
}
async function getJSON(url) {
  const response = await fetch(url, {cache: 'no-store'});
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The release server did not return JSON. Check that PHP is enabled on the web host.'); }
  if (!response.ok) throw new Error(data.error || `Download failed (HTTP ${response.status}).`);
  return data;
}
async function loadBoards() {
  const current = ++revision;
  clearPrepared();
  targets = [];
  $('confirm-board').checked = $('confirm-erase').checked = false;
  const release = selectedRelease();
  if (!release) { loading = false; updateControls(); return; }
  loading = true;
  updateControls();
  $('release-link').href = `https://github.com/pdxlocations/form8/releases/tag/${encodeURIComponent(release.tag)}`;
  status('Loading board builds…');
  try {
    const results = await Promise.allSettled([
      release.assets.some(a => a.name === 'manifest.json')
        ? getJSON(api('manifest', {release:release.id})).then(m => validateTargets(m, release)) : Promise.resolve([]),
      release.assets.some(a => a.name === 'SHA256SUMS-NRF52') ? (async () => {
        const [catalog, response] = await Promise.all([getJSON('nrf52-targets.json'), fetch(api('checksums', {release:release.id}), {cache:'no-store'})]);
        if (!response.ok) throw new Error('Cannot load nRF release checksums. Refresh and try again.');
        return validateNrfTargets(catalog, await response.text(), release);
      })() : Promise.resolve([])
    ]);
    if (revision !== current) return;
    targets = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!targets.length) throw new Error(results.find(r => r.status === 'rejected')?.reason?.message || 'No complete board builds available yet.');
    const failed = results.some(r => r.status === 'rejected');
    options($('board'), targets, target => `${target.chipFamily || 'ESP32-S3'} · ${target.board}${target.experimental ? ' — experimental' : ''}`, target => target.environment, 'No builds available');
    status(`${targets.length} board builds available. Check your board, then download its firmware.${failed ? ' Some builds could not be loaded; refresh to retry.' : ''}`, failed);
  } catch (error) {
    if (revision !== current) return;
    options($('board'), [], null, null, 'No builds available');
    status(error.message, true);
  } finally { if (revision === current) { loading = false; updateControls(); } }
}
async function filterReleases(preferred) {
  releases = availableReleases(allReleases, $('prereleases').checked);
  options($('release'), releases, release => `${release.tag}${release.prerelease ? ' · prerelease' : ''}`, release => release.id, 'No published builds available');
  if (preferred && releases.some(release => String(release.id) === preferred)) $('release').value = preferred;
  if (!releases.length) {
    ++revision; clearPrepared(); targets = []; loading = false;
    options($('board'), [], null, null, 'No builds available');
    status('No completed releases found. Publish a GitHub release and wait for its firmware build, then refresh.');
    updateControls(); return;
  }
  await loadBoards();
}
async function refresh() {
  const preferred = $('release').value;
  ++revision; clearPrepared(); loading = true; targets = []; updateControls();
  status('Checking GitHub releases…');
  try {
    const data = await getJSON(api('releases'));
    if (!Array.isArray(data.releases)) throw new Error('Invalid release list.');
    allReleases = data.releases;
    await filterReleases(preferred);
  } catch (error) { loading = false; status(error.message, true); updateControls(); }
}
$('refresh').addEventListener('click', refresh);
$('release').addEventListener('change', loadBoards);
$('prereleases').addEventListener('change', () => filterReleases($('release').value));
for (const input of document.querySelectorAll('#board, #nrf-format, input[name=mode], #confirm-board, #confirm-erase')) input.addEventListener('change', () => {
  if (input.id === 'board') $('confirm-board').checked = $('confirm-erase').checked = false;
  if (input.name === 'mode') $('confirm-erase').checked = false;
  clearPrepared(); updateControls();
  status(nrf() ? 'Download the matching UF2 or HEX, then follow the nRF installation instructions.' : factory() ? 'First installation replaces saved data. Confirm your selection before continuing.' : 'Update selected. Leave “Erase device” unchecked in the installer.');
});
$('prepare').addEventListener('click', async () => {
  const release = selectedRelease(), target = selectedTarget(), image = selectedImage();
  if ($('prepare').disabled || !image) return;
  clearPrepared(); preparing = true; updateControls();
  status('Downloading firmware and checking SHA-256…');
  try {
    const response = await fetch(api('binary', {release: release.id, file: image.file}), {cache: 'no-store'});
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Firmware download failed.'); }
    const buffer = await response.arrayBuffer();
    await verifyImage(buffer, image);
    if (target.chipFamily === 'NRF52840') {
      binaryURL = URL.createObjectURL(new Blob([buffer], {type:'application/octet-stream'}));
      $('save-firmware').href = binaryURL;
      $('save-firmware').download = image.file;
      $('save-firmware').textContent = `Save ${image.file}`;
      $('download-area').hidden = false;
      status('Verified. Save the firmware file, then follow the nRF installation steps above.');
      return;
    }
    // Import after verification; the USB permission request remains a direct user click.
    await import('https://unpkg.com/esp-web-tools@10.4.0/dist/web/install-button.js?module');
    await customElements.whenDefined('esp-web-install-button');
    binaryURL = URL.createObjectURL(new Blob([buffer], {type: 'application/octet-stream'}));
    manifestURL = URL.createObjectURL(new Blob([JSON.stringify(installManifest(target, image, release.tag, binaryURL))], {type: 'application/json'}));
    $('install').manifest = manifestURL;
    $('install-area').hidden = false;
    status(factory() ? 'Verified. First installation replaces all data. Connect your radio to continue.' : 'Verified. Connect your radio; leave “Erase device” unchecked to preserve saved data.');
  } catch (error) { clearPrepared(); status(error.message, true); }
  finally { preparing = false; updateControls(); }
});
window.addEventListener('pagehide', clearPrepared);
if (!supported) {
  $('browser-note').hidden = false;
  $('browser-note').textContent = window.isSecureContext
    ? 'nRF firmware downloads work in this browser. ESP32 USB flashing requires Web Serial. Use desktop Chrome or Edge and a USB data cable.'
    : 'Open this installer over HTTPS. USB access is blocked on an ordinary HTTP website.';
}
refresh();
