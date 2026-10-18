"""Collect completed builds into platform folders and a single release ZIP."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def filename(value):
    if not isinstance(value, str) or not value or Path(value).name != value or '/' in value or '\\' in value or value in ('.', '..'):
        raise ValueError('Expected a plain release filename')
    return value


def copy_verified(source, destination, expected):
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
        raise ValueError(f'Checksum mismatch: {source.name}')
    shutil.copy2(source, destination)


def package_release(root=ROOT):
    dist = root/'dist'
    dist.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='release-staging-', dir=dist) as temporary:
        staging = Path(temporary)
        tree = staging/'release'
        for folder in ('esp32', 'nrf52', 'webflasher'):
            (tree/folder).mkdir(parents=True)
        esp = dist/'firmware'
        manifest = json.loads((esp/'manifest.json').read_text())
        if not isinstance(manifest, list) or not manifest:
            raise ValueError('No ESP32 builds to package')
        for target in manifest:
            for image in (target, target['factory']):
                name = filename(image['file'])
                copy_verified(esp/name, tree/'esp32'/name, image['sha256'])
        for name in ('manifest.json', 'SHA256SUMS', 'README.txt'):
            shutil.copy2(esp/name, tree/'esp32'/name)
        nrf = dist/'nrf52'
        lines = (nrf/'SHA256SUMS-NRF52').read_text().splitlines()
        if not lines:
            raise ValueError('No nRF52 builds to package')
        for line in lines:
            digest, name = line.split()
            name = filename(name)
            copy_verified(nrf/name, tree/'nrf52'/name, digest)
        for name in ('SHA256SUMS-NRF52', 'README-NRF52.txt'):
            shutil.copy2(nrf/name, tree/'nrf52'/name)
        shutil.copytree(root/'webflasher', tree/'webflasher', dirs_exist_ok=True)
        (tree/'README.txt').write_text(
            'Form8 release downloads\n\n'
            'esp32/      App-only and first-install factory images, manifest and checksums.\n'
            'nrf52/      Application UF2/HEX images and SoftDevice instructions.\n'
            'webflasher/ Upload these contents to your PHP/HTTPS web host.\n\n'
            'ESP32 updates: use the app-only image to preserve stored messages.\n'
            'nRF52: read INFO_UF2.TXT and match the installed SoftDevice before flashing.\n'
            'Stock RAK S140 6.1.1: form8-rak4631-s140-6-1-1.uf2.\n'
            'Other profiles require S140 7.3.0. Images do not replace the SoftDevice.\n'
            'Android: download form8-android-debug.apk separately from the same release.\n'
            'Keep the Android app and radio firmware from the same release.\n'
            'Guides: https://github.com/pdxlocations/form8/wiki\n')
        checksums = []
        for source in sorted(tree.rglob('*')):
            if source.is_file():
                checksums.append(f'{hashlib.sha256(source.read_bytes()).hexdigest()}  {source.relative_to(tree).as_posix()}')
        (tree/'SHA256SUMS').write_text('\n'.join(checksums)+'\n')
        archive = staging/'form8-release.zip'
        with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
            for source in sorted(tree.rglob('*')):
                if source.is_file():
                    bundle.write(source, source.relative_to(tree).as_posix())
        with ZipFile(archive) as bundle:
            if bundle.testzip() is not None:
                raise ValueError('Release ZIP integrity check failed')
        output = dist/'release'
        if output.exists():
            shutil.rmtree(output)
        tree.rename(output)
        archive.replace(dist/'form8-release.zip')
        (dist/'form8-release.zip.sha256').write_text(f'{hashlib.sha256((dist / "form8-release.zip").read_bytes()).hexdigest()}  form8-release.zip\n')
    print(f'Organized release: {dist / "release"}\nBundle: {dist / "form8-release.zip"}')


if __name__ == '__main__':
    package_release()
