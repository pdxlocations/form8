"""Check nRF application boundaries for both supported S140 layouts."""
import struct
import tempfile
import unittest
from pathlib import Path
from build_nrf52 import parse_hex, to_uf2, FAMILY


def record(address, kind, payload):
    data = bytes([len(payload)]) + address.to_bytes(2, 'big') + bytes([kind]) + payload
    return ':' + (data + bytes([-sum(data) & 255])).hex().upper()


class ImageTests(unittest.TestCase):
    def image(self, start, extra=None):
        lines = [record(0, 4, (start >> 16).to_bytes(2, 'big')),
                 record(start & 65535, 0, struct.pack('<II', 0x20040000, start | 1))]
        if extra is not None:
            lines += [record(0, 4, (extra >> 16).to_bytes(2, 'big')),
                      record(extra & 65535, 0, b'\x00')]
        return '\n'.join(lines + [record(0, 1, b'')]) + '\n'

    def test_matching_layout_and_uf2_family(self):
        for start in (0x26000, 0x27000):
            with self.subTest(start=start), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'firmware.hex'
                path.write_text(self.image(start))
                image = to_uf2(parse_hex(path, start))
                header = struct.unpack('<8I', image[:32])
                self.assertEqual(header[3], start)
                self.assertEqual(header[7], FAMILY)
                self.assertEqual(len(image), 512)

    def test_wrong_profile_rejected(self):
        for actual, expected in ((0x26000, 0x27000), (0x27000, 0x26000)):
            with self.subTest(actual=actual), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'firmware.hex'
                path.write_text(self.image(actual))
                with self.assertRaises(ValueError):
                    parse_hex(path, expected)

    def test_softdevice_and_filesystem_are_protected(self):
        for start in (0x26000, 0x27000):
            for extra in (start - 1, 0xED000, 0xF4000):
                with self.subTest(start=start, extra=extra), tempfile.TemporaryDirectory() as tmp:
                    path = Path(tmp) / 'firmware.hex'
                    path.write_text(self.image(start, extra))
                    with self.assertRaisesRegex(ValueError, 'reserved memory'):
                        parse_hex(path, start)


if __name__ == '__main__':
    unittest.main()
