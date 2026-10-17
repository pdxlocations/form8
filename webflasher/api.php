<?php
declare(strict_types=1);
require_once __DIR__ . '/config.php';

function fail_request(string $message, int $status = 502): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

function allowed_asset(array $asset): bool {
    return ($asset['name'] ?? '') === 'manifest.json'
        || ($asset['name'] ?? '') === 'SHA256SUMS-NRF52'
        || preg_match('/^form8-[a-z0-9-]+\.(?:bin|uf2|hex)$/D', $asset['name'] ?? '') === 1;
}

function github_url(string $url, bool $asset): bool {
    $parts = parse_url($url);
    if (!$parts || ($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) return false;
    if ($asset) return ($parts['host'] ?? '') === 'github.com'
        && str_starts_with($parts['path'] ?? '', '/' . FORM8_REPOSITORY . '/releases/download/');
    return ($parts['host'] ?? '') === 'api.github.com'
        && ($parts['path'] ?? '') === '/repos/' . FORM8_REPOSITORY . '/releases';
}

function fetch_github(string $url, bool $asset = false): string {
    if (!github_url($url, $asset)) throw new RuntimeException('Invalid GitHub download URL.');
    if (!function_exists('curl_init')) throw new RuntimeException('Enable the PHP cURL extension on this host.');
    $cacheDir = sys_get_temp_dir() . '/form8-flasher-' . substr(hash('sha256', __DIR__), 0, 16);
    if (!is_dir($cacheDir) && !@mkdir($cacheDir, 0700, true) && !is_dir($cacheDir)) throw new RuntimeException('Cannot create the download cache.');
    $cache = $cacheDir . '/' . hash('sha256', $url);
    if (is_file($cache) && time() - filemtime($cache) < FORM8_CACHE_SECONDS) {
        $cached = file_get_contents($cache);
        if ($cached !== false) return $cached;
    }
    $body = '';
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_USERAGENT => 'Form8-WebFlasher',
        CURLOPT_HTTPHEADER => ['Accept: ' . ($asset ? 'application/octet-stream' : 'application/vnd.github+json')],
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body): int {
            if (strlen($body) + strlen($chunk) > FORM8_MAX_DOWNLOAD) return 0;
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    $ok = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if ($ok === false || $status !== 200) {
        if ($status === 403 || $status === 429) throw new RuntimeException('GitHub is limiting downloads. Please try again in a few minutes.');
        throw new RuntimeException('GitHub download failed. Try again shortly (HTTP ' . $status . ').');
    }
    $temporary = tempnam($cacheDir, 'download-');
    if ($temporary !== false) {
        if (file_put_contents($temporary, $body) !== false) @rename($temporary, $cache);
        if (is_file($temporary)) @unlink($temporary);
    }
    return $body;
}

function releases(): array {
    $data = json_decode(fetch_github('https://api.github.com/repos/' . FORM8_REPOSITORY . '/releases?per_page=20'), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data) || !array_is_list($data)) throw new RuntimeException('Unexpected GitHub response.');
    return array_values(array_filter($data, static fn($release) => is_array($release) && empty($release['draft'])));
}

if (defined('FORM8_API_LIBRARY')) return;
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') fail_request('Only GET requests are supported.', 405);
$resource = $_GET['resource'] ?? '';
if (!in_array($resource, ['releases', 'manifest', 'checksums', 'binary'], true)) fail_request('Unknown resource.', 400);
if (isset($_GET['url'])) fail_request('Arbitrary URLs are not supported.', 400);
try {
    $releases = releases();
    if ($resource === 'releases') {
        header('Content-Type: application/json');
        echo json_encode(['repository' => FORM8_REPOSITORY, 'releases' => array_map(static fn($release) => [
            'id' => $release['id'], 'tag' => $release['tag_name'], 'name' => $release['name'],
            'prerelease' => $release['prerelease'], 'publishedAt' => $release['published_at'],
            'assets' => array_values(array_map(static fn($asset) => ['id' => $asset['id'], 'name' => $asset['name'], 'bytes' => $asset['size'] ?? 0],
                array_filter($release['assets'] ?? [], 'allowed_asset'))),
        ], $releases)], JSON_THROW_ON_ERROR);
        exit;
    }
    $releaseId = $_GET['release'] ?? '';
    if (!is_string($releaseId) || !ctype_digit($releaseId)) fail_request('Invalid release.', 400);
    $matches = array_values(array_filter($releases, static fn($item) => (string) $item['id'] === $releaseId));
    if (!$matches) fail_request('Release is no longer in the latest 20 releases. Refresh the list.', 404);
    $name = $resource === 'manifest' ? 'manifest.json' : ($resource === 'checksums' ? 'SHA256SUMS-NRF52' : ($_GET['file'] ?? ''));
    if (!is_string($name) || !allowed_asset(['name' => $name]) || ($resource === 'binary' && preg_match('/\.(?:bin|uf2|hex)$/D', $name) !== 1)) fail_request('Invalid asset.', 400);
    $assets = array_values(array_filter($matches[0]['assets'] ?? [], static fn($item) => $item['name'] === $name));
    if (!$assets) fail_request('This release does not contain that asset. Its build may still be running.', 404);
    if (($assets[0]['size'] ?? 0) > FORM8_MAX_DOWNLOAD) fail_request('Asset exceeds the download limit.', 413);
    $body = fetch_github($assets[0]['browser_download_url'], true);
    header('Content-Type: ' . ($resource === 'manifest' ? 'application/json' : 'application/octet-stream'));
    header('Content-Length: ' . strlen($body));
    echo $body;
} catch (Throwable $error) {
    error_log('Form8 webflasher: ' . $error->getMessage());
    fail_request($error instanceof RuntimeException ? $error->getMessage() : 'Cannot load GitHub release data. Please try again.');
}
