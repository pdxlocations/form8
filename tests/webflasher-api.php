<?php
declare(strict_types=1);
define('FORM8_API_LIBRARY', true);
require __DIR__ . '/../webflasher/api.php';

$checks = [
    'release endpoint' => github_url('https://api.github.com/repos/pdxlocations/form8/releases?per_page=20', false),
    'release asset' => github_url('https://github.com/pdxlocations/form8/releases/download/v1/form8-heltec-v3.bin', true),
    'foreign host' => !github_url('https://evil.example/pdxlocations/form8/releases/download/v1/file.bin', true),
    'plaintext URL' => !github_url('http://github.com/pdxlocations/form8/releases/download/v1/file.bin', true),
    'other repository' => !github_url('https://github.com/other/repo/releases/download/v1/file.bin', true),
    'embedded credentials' => !github_url('https://user@github.com/pdxlocations/form8/releases/download/v1/file.bin', true),
    'custom port' => !github_url('https://github.com:443/pdxlocations/form8/releases/download/v1/file.bin', true),
    'path traversal' => !allowed_asset(['name' => '../../config.php']),
    'wrong extension' => !allowed_asset(['name' => 'form8-test.bin.php']),
    'newline suffix' => !allowed_asset(['name' => "form8-test.bin\n"]),
    'nRF UF2' => allowed_asset(['name' => 'form8-rak4631.uf2']),
    'nRF HEX' => allowed_asset(['name' => 'form8-rak4631.hex']),
    'nRF checksums' => allowed_asset(['name' => 'SHA256SUMS-NRF52']),
    'nRF traversal' => !allowed_asset(['name' => '../form8-rak4631.uf2']),
    'nRF suffix' => !allowed_asset(['name' => 'form8-rak4631.uf2.php']),
    'factory asset' => allowed_asset(['name' => 'form8-heltec-v3-factory.bin']),
];
foreach ($checks as $name => $passed) {
    if (!$passed) throw new RuntimeException('Failed PHP boundary check: ' . $name);
}
echo "PHP asset and URL restrictions passed.\n";
