"""Build application-only nRF52840 UF2/HEX images; preserve SoftDevice/bootloader."""
import argparse
import configparser
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
START, END, FAMILY = 0x27000, 0xED000, 0xADA52840

def parse_hex(path):
    memory, base = {}, 0
    for line in path.read_text().splitlines():
        if not line.startswith(':'):
            raise ValueError('Invalid Intel HEX line')
        data = bytes.fromhex(line[1:])
        if sum(data) & 255 or len(data) != data[0] + 5:
            raise ValueError('Intel HEX checksum/length failure')
        count, address, kind = data[0], int.from_bytes(data[1:3], 'big'), data[3]
        if kind == 0:
            for i, value in enumerate(data[4:4+count]):
                target = base + address + i
                if not START <= target < END:
                    raise ValueError(f'Image would overwrite reserved memory at {target:#x}')
                if target in memory and memory[target] != value:
                    raise ValueError('Overlapping HEX records')
                memory[target] = value
        elif kind == 4:
            base = int.from_bytes(data[4:6], 'big') << 16
        elif kind == 2:
            base = int.from_bytes(data[4:6], 'big') << 4
        elif kind not in (1, 3, 5):
            raise ValueError('Unsupported HEX record')
    if any(START+i not in memory for i in range(8)):
        raise ValueError('Missing application vector table at 0x27000')
    sp, pc = struct.unpack('<II', bytes(memory[START+i] for i in range(8)))
    if not 0x20008000 < sp <= 0x20040000 or not (pc & 1 and START <= (pc & ~1) < END):
        raise ValueError('Invalid nRF52840 vector table')
    return memory

def to_uf2(memory):
    addresses = sorted({address & ~255 for address in memory})
    result = bytearray()
    for block, address in enumerate(addresses):
        payload = bytes(memory.get(address+i, 255) for i in range(256))
        header = struct.pack('<8I', 0x0A324655, 0x9E5D5157, 0x2000, address, 256, block, len(addresses), FAMILY)
        result.extend(header + payload + bytes(220) + struct.pack('<I', 0x0AB16F30))
    return bytes(result)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-only', action='store_true')
    args = parser.parse_args()
    catalog = json.loads((ROOT/'config/nrf52-targets.json').read_text())
    config = configparser.ConfigParser(interpolation=None)
    config.read(ROOT/'platformio-nrf52.ini')
    envs = {s[4:] for s in config.sections() if s.startswith('env:')}
    if envs != {t['environment'] for t in catalog} or len(envs) != len(catalog):
        raise SystemExit('nRF catalog and environments differ')
    if not args.package_only:
        pio = shutil.which('pio') or str(Path.home()/'.platformio/penv/bin/pio')
        command = [pio, 'run', '-c', 'platformio-nrf52.ini']
        for target in catalog:
            command.extend(['-e', target['environment']])
        subprocess.run(command, cwd=ROOT, check=True)
    dest = ROOT/'dist/nrf52'
    dest.mkdir(parents=True, exist_ok=True)
    checksums, packaged = [], []
    for target in catalog:
        name = 'form8-'+target['environment']
        source = ROOT/'.pio/build'/target['environment']/'firmware.hex'
        memory = parse_hex(source)
        for suffix, data in [('hex', source.read_bytes()), ('uf2', to_uf2(memory))]:
            path = dest/f'{name}.{suffix}'
            path.write_bytes(data)
            checksums.append(f'{hashlib.sha256(data).hexdigest()}  {path.name}')
            packaged.append(path)
    (dest/'SHA256SUMS-NRF52').write_text('\n'.join(checksums)+'\n')
    (dest/'README-NRF52.txt').write_text(
        'Form8 nRF52840 application images (experimental; hardware testing required)\n\n'
        'Requires the correct board UF2 bootloader with Nordic S140 7.3.0 already installed.\n'
        'Application starts at 0x27000; images do not install or replace the SoftDevice or bootloader.\n'
        'Check INFO_UF2.TXT in bootloader mode before copying the matching UF2.\n'
        'Do not use ESP32 web flashing or upload a filesystem image for these boards.\n'
        'Android app: Settings > Radio connection > Bluetooth or USB serial > Find radios > Connect.\n'
        'The app stores message bodies. Keep it open for reception, radio ACKs, repair, and retries.\n'
        'Without the app, the node retains settings and relays its selected incident; it cannot durably receive forms.\n'
        'T1000-E normally connects over BLE; its magnetic cable is not a general USB CDC data port.\n'
        'Guide: https://github.com/pdxlocations/form8/wiki/nRF52-and-Android\n')
    packaged.extend([dest/'SHA256SUMS-NRF52', dest/'README-NRF52.txt'])
    archive = ROOT/'dist/form8-nrf52-firmware.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for path in packaged:
            bundle.write(path, path.name)
    print(f'Packaged {len(catalog)} nRF targets: {archive}')

if __name__ == '__main__':
    main()
