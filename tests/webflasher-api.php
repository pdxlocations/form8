<?php
declare(strict_types=1);
define('FORM8_API_LIBRARY', true);
require __DIR__ . '/../webflasher/api.php';

function check(bool $passed, string $name): void {
    if (!$passed) throw new RuntimeException('Failed PHP check: ' . $name);
}
function rejects(callable $fn, string $message): void {
    try { $fn(); } catch (RuntimeException $e) { check(str_contains($e->getMessage(), $message), $e->getMessage()); return; }
    throw new RuntimeException('Expected rejection: ' . $message);
}
$checks = [
    'release endpoint' => github_url('https://api.github.com/repos/pdxlocations/form8/releases?per_page=20', false),
    'release archive' => github_url('https://github.com/pdxlocations/form8/releases/download/v1/form8-release.zip', true),
    'foreign host' => !github_url('https://evil.example/pdxlocations/form8/releases/download/v1/file.zip', true),
    'plaintext URL' => !github_url('http://github.com/pdxlocations/form8/releases/download/v1/file.zip', true),
    'other repository' => !github_url('https://github.com/other/repo/releases/download/v1/file.zip', true),
    'embedded credentials' => !github_url('https://user@github.com/pdxlocations/form8/releases/download/v1/file.zip', true),
    'custom port' => !github_url('https://github.com:443/pdxlocations/form8/releases/download/v1/file.zip', true),
    'bundle only' => allowed_asset(['name'=>'form8-release.zip']) && !allowed_asset(['name'=>'form8-release.zip.sha256']),
    'old raw firmware excluded' => !allowed_asset(['name'=>'form8-heltec-v3.bin']) && !allowed_asset(['name'=>'manifest.json']),
    'archive traversal' => !allowed_asset(['name'=>'../form8-release.zip']),
    'archive suffix' => !allowed_asset(['name'=>"form8-release.zip\n"]),
    'ESP32 path' => member_path('form8-heltec-v3-factory.bin') === 'esp32/form8-heltec-v3-factory.bin',
    'nRF UF2 path' => member_path('form8-rak4631-s140-6-1-1.uf2') === 'nrf52/form8-rak4631-s140-6-1-1.uf2',
    'nRF HEX path' => member_path('form8-rak4631.hex') === 'nrf52/form8-rak4631.hex',
    'manifest path' => member_path('manifest.json') === 'esp32/manifest.json',
    'checksums path' => member_path('SHA256SUMS-NRF52') === 'nrf52/SHA256SUMS-NRF52',
    'member traversal' => member_path('../form8-rak4631.uf2') === null && member_path('esp32/../manifest.json') === null,
    'member suffix' => member_path('form8-rak4631.uf2.php') === null && member_path("form8-test.bin\n") === null,
    'APK and host files not served as firmware' => member_path('form8-android-debug.apk') === null && member_path('config.php') === null,
];
foreach ($checks as $name => $passed) check($passed, $name);
check(class_exists('ZipArchive'), 'PHP ZIP extension required');
$temporary = tempnam(sys_get_temp_dir(), 'form8-zip-test-');
try {
    $writer = new ZipArchive(); check($writer->open($temporary, ZipArchive::OVERWRITE) === true, 'create fixture');
    $files = [
        'esp32/manifest.json'=>'[{"environment":"heltec-v3"}]',
        'esp32/form8-heltec-v3.bin'=>"APP\0\x01",
        'esp32/form8-heltec-v3-factory.bin'=>"FACTORY\0\x02",
        'nrf52/SHA256SUMS-NRF52'=>'checksums',
        'nrf52/form8-rak4631-s140-6-1-1.uf2'=>"UF2\0\x03",
        'nrf52/form8-rak4631.hex'=>':020000040002F8',
        'android/form8-android-debug.apk'=>'APK',
        'webflasher/config.php'=>'private host file',
        '../esp32/form8-injected.bin'=>'bad',
        'nrf52/../esp32/form8-injected.bin'=>'bad',
        'other/form8-injected.bin'=>'bad',
    ];
    foreach ($files as $name=>$body) $writer->addFromString($name, $body);
    $writer->close();
    $zip = open_bundle($temporary); $assets = bundle_assets($zip);
    check(count($assets) === 6, 'only exact firmware paths cataloged');
    foreach ($assets as $asset) {
        $path = member_path($asset['name']);
        check(bundle_member($zip, $asset['name'], $assets) === $files[$path], 'exact binary/metadata bytes');
        check($asset['bytes'] === strlen($files[$path]), 'uncompressed image size');
    }
    rejects(fn()=>bundle_member($zip, 'config.php', $assets), 'does not contain');
    rejects(fn()=>bundle_member($zip, '../form8-heltec-v3.bin', $assets), 'does not contain');
    rejects(fn()=>bundle_member($zip, 'form8-missing.bin', $assets), 'does not contain');
    $zip->close();
    $writer->open($temporary, ZipArchive::OVERWRITE);
    $writer->addFromString('esp32/manifest.json', str_repeat('x', 1024*1024+1)); $writer->close();
    $zip=open_bundle($temporary); rejects(fn()=>bundle_assets($zip), 'size limit'); $zip->close();
    $writer->open($temporary, ZipArchive::OVERWRITE);
    $writer->addFromString('nrf52/form8-test.uf2', str_repeat('x', FORM8_MAX_IMAGE+1)); $writer->close();
    $zip=open_bundle($temporary); rejects(fn()=>bundle_assets($zip), 'size limit'); $zip->close();
    $writer->open($temporary, ZipArchive::OVERWRITE);
    for ($i=0; $i<513; ++$i) $writer->addFromString('unused/'.$i, 'x'); $writer->close();
    $zip=open_bundle($temporary); rejects(fn()=>bundle_assets($zip), 'too many entries'); $zip->close();
    file_put_contents($temporary, 'not a ZIP'); rejects(fn()=>open_bundle($temporary), 'Cannot open');
} finally { @unlink($temporary); }
echo "PHP foldered ZIP catalog, exact image bytes, size limits, allowed paths and GitHub URL checks passed.\n";
