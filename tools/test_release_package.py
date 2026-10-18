"""Test release layout, verified inputs, and preservation of previous packages."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile
from package_release import package_release


def digest(data):
    return hashlib.sha256(data).hexdigest()


class ReleasePackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='form8-release-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.dist = self.root/'dist'
        esp = self.dist/'firmware'
        nrf = self.dist/'nrf52'
        web = self.root/'webflasher'
        for folder in (esp, nrf, web/'map-assets'):
            folder.mkdir(parents=True)
        manifest = {'file':'form8-test.bin', 'sha256':digest(b'app'), 'factory':{'file':'form8-test-factory.bin', 'sha256':digest(b'factory')}}
        (esp/'manifest.json').write_text(json.dumps([manifest]))
        (esp/manifest['file']).write_bytes(b'app')
        (esp/manifest['factory']['file']).write_bytes(b'factory')
        (esp/'README.txt').write_text('ESP32 guide')
        (esp/'SHA256SUMS').write_text(f'{digest(b"app")}  form8-test.bin\n{digest(b"factory")}  form8-test-factory.bin\n')
        (esp/'form8-obsolete.bin').write_bytes(b'Exclude stale images')
        (nrf/'form8-rak4631-s140-6-1-1.uf2').write_bytes(b'stock RAK')
        (nrf/'SHA256SUMS-NRF52').write_text(f'{digest(b"stock RAK")}  form8-rak4631-s140-6-1-1.uf2\n')
        (nrf/'README-NRF52.txt').write_text('Match installed SoftDevice')
        (nrf/'form8-obsolete.hex').write_bytes(b'Exclude stale images')
        (self.dist/'form8-android-debug.apk').write_bytes(b'APK')
        (self.dist/'form8-android-debug.apk.sha256').write_text(f'{digest(b"APK")}  form8-android-debug.apk\n')
        (self.dist/'form8-android-older.apk').write_bytes(b'Exclude older APK')
        (web/'index.html').write_text('Installer')
        (web/'map-assets'/'map.js').write_text('Map')

    def test_layout_and_checksums(self):
        package_release(self.root)
        with ZipFile(self.dist/'form8-release.zip') as bundle:
            names = set(bundle.namelist())
            self.assertEqual({name.split('/')[0] for name in names}, {'esp32', 'nrf52', 'webflasher', 'README.txt', 'SHA256SUMS'})
            self.assertFalse(any(name.startswith('android/') or name.endswith(('.apk', '.apk.sha256')) for name in names))
            self.assertIn('nrf52/form8-rak4631-s140-6-1-1.uf2', names)
            self.assertIn('webflasher/map-assets/map.js', names)
            self.assertFalse(any('obsolete' in name or 'older' in name for name in names))
            hashes = {}
            for line in bundle.read('SHA256SUMS').decode().splitlines():
                checksum, name = line.split(maxsplit=1)
                hashes[name] = checksum
                self.assertEqual(digest(bundle.read(name)), checksum)
                self.assertEqual(bundle.read(name), (self.dist/'release'/name).read_bytes())
            self.assertEqual(set(hashes), names-{'SHA256SUMS'})
            self.assertIn(b'S140 6.1.1', bundle.read('README.txt'))
            self.assertIsNone(bundle.testzip())
        checksum, name = (self.dist/'form8-release.zip.sha256').read_text().split()
        self.assertEqual(name, 'form8-release.zip')
        self.assertEqual(checksum, digest((self.dist/name).read_bytes()))
        # Re-runs replace the package rather than retaining stale files.
        (self.dist/'release'/'old.txt').write_text('old')
        package_release(self.root)
        self.assertFalse((self.dist/'release'/'old.txt').exists())

    def test_corrupt_input_preserves_previous_package(self):
        package_release(self.root)
        original = (self.dist/'form8-release.zip').read_bytes()
        for path in ('firmware/form8-test.bin', 'nrf52/form8-rak4631-s140-6-1-1.uf2'):
            with self.subTest(path=path):
                source = self.dist/path
                previous = source.read_bytes()
                source.write_bytes(b'corrupt')
                with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
                    package_release(self.root)
                self.assertEqual((self.dist/'form8-release.zip').read_bytes(), original)
                self.assertTrue((self.dist/'release'/'README.txt').is_file())
                source.write_bytes(previous)

    def test_firmware_package_does_not_require_an_android_build(self):
        (self.dist/'form8-android-debug.apk').unlink()
        (self.dist/'form8-android-debug.apk.sha256').unlink()
        package_release(self.root)
        with ZipFile(self.dist/'form8-release.zip') as bundle:
            self.assertFalse(any(name.startswith('android/') or name.endswith('.apk') for name in bundle.namelist()))

    def test_missing_factory_image_fails_before_output(self):
        (self.dist/'firmware/form8-test-factory.bin').unlink()
        with self.assertRaises(FileNotFoundError):
            package_release(self.root)
        self.assertFalse((self.dist/'form8-release.zip').exists())


if __name__ == '__main__':
    unittest.main()
